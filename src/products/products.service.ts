import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as XLSX from "xlsx";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require("adm-zip");
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import {
  Product,
  ProductDocument,
  ProductCategory,
} from "./schemas/product.schema";

export interface PaginatedProducts {
  data: ProductDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductAnalytics {
  total: number;
  active: number;
  inactive: number;
  categories: string[];
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async create(dto: CreateProductDto): Promise<ProductDocument> {
    const existing = await this.productModel
      .findOne({ serialNumber: dto.serialNumber })
      .exec();
    if (existing) {
      throw new ConflictException(
        `Serial number "${dto.serialNumber}" already exists.`,
      );
    }
    const product = new this.productModel(dto);
    return product.save();
  }

  async findAll(
    params: {
      page?: number;
      limit?: number;
      category?: string;
      search?: string;
    } = {},
  ): Promise<PaginatedProducts> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { isArchived: false };
    if (params.category) filter["category"] = params.category;
    if (params.search) {
      const regex = { $regex: params.search.trim(), $options: "i" };
      filter["$or"] = [
        { name: regex },
        { serialNumber: regex },
        { category: regex },
      ];
    }

    const [data, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getAnalytics(): Promise<ProductAnalytics> {
    const [groups, categories] = await Promise.all([
      this.productModel
        .aggregate<{
          _id: boolean;
          count: number;
        }>([
          { $match: { isArchived: false } },
          { $group: { _id: "$isActive", count: { $sum: 1 } } },
        ])
        .exec(),
      this.productModel
        .distinct("category", { isArchived: false })
        .exec() as Promise<string[]>,
    ]);

    let active = 0;
    let inactive = 0;
    for (const g of groups) {
      if (g._id === true) active = g.count;
      else inactive = g.count;
    }
    return { total: active + inactive, active, inactive, categories };
  }

  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException(`Product "${id}" not found.`);
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDocument> {
    if (dto.serialNumber) {
      const conflict = await this.productModel
        .findOne({ serialNumber: dto.serialNumber, _id: { $ne: id } })
        .exec();
      if (conflict) {
        throw new ConflictException(
          `Serial number "${dto.serialNumber}" already exists.`,
        );
      }
    }
    const updated = await this.productModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();
    if (!updated) throw new NotFoundException(`Product "${id}" not found.`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.productModel
      .findByIdAndUpdate(id, { isArchived: true }, { new: true })
      .exec();
    if (!result) throw new NotFoundException(`Product "${id}" not found.`);
  }

  /**
   * Extract embedded images from an XLSX buffer.
   * Returns Map<dataRowIndex, base64DataUri> where dataRowIndex is 0-based
   * (0 = first data row after the header row).
   * Returns an empty Map for CSVs or files without images.
   */
  private extractImagesFromXlsx(buffer: Buffer): Map<number, string> {
    const rowImageMap = new Map<number, string>();
    try {
      const zip = new AdmZip(buffer);

      // Find the drawing XML (drawing1.xml is the first/only drawing in most files)
      const drawingEntry = zip.getEntry("xl/drawings/drawing1.xml");
      if (!drawingEntry) return rowImageMap;
      const drawingXml: string = drawingEntry.getData().toString("utf8");

      // Find the drawing relationships to map rId → media file
      const relsEntry = zip.getEntry("xl/drawings/_rels/drawing1.xml.rels");
      if (!relsEntry) return rowImageMap;
      const relsXml: string = relsEntry.getData().toString("utf8");

      // Build rId → zip-internal media path
      const ridToPath = new Map<string, string>();
      const relRegex = /Id="(rId\d+)"[^>]+Target="([^"]+)"/g;
      let rm: RegExpExecArray | null;
      while ((rm = relRegex.exec(relsXml)) !== null) {
        // Target is "../media/image1.png" → resolve to "xl/media/image1.png"
        const zipPath = "xl/" + rm[2].replace(/^\.\.\//, "");
        ridToPath.set(rm[1], zipPath);
      }

      // Parse each anchor block in the drawing XML
      // Use backreference so the closing tag matches the opening tag type
      const anchorRegex =
        /<xdr:(twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:\1>/g;
      let anchor: RegExpExecArray | null;
      while ((anchor = anchorRegex.exec(drawingXml)) !== null) {
        const block = anchor[0];

        // <xdr:from><xdr:row>N</xdr:row> — 0-based Excel row (row 0 = header)
        const rowMatch = block.match(
          /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/,
        );
        if (!rowMatch) continue;
        const excelFromRow = parseInt(rowMatch[1], 10);

        // r:embed="rIdX" inside the blip element
        const embedMatch = block.match(/r:embed="(rId\d+)"/);
        if (!embedMatch) continue;

        const mediaPath = ridToPath.get(embedMatch[1]);
        if (!mediaPath) continue;

        const mediaEntry = zip.getEntry(mediaPath);
        if (!mediaEntry) continue;

        const ext = (mediaPath.split(".").pop() ?? "jpeg").toLowerCase();
        const mimeMap: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          bmp: "image/bmp",
        };
        const mime = mimeMap[ext] ?? "image/jpeg";
        const b64 = `data:${mime};base64,${mediaEntry.getData().toString("base64")}`;

        // excelFromRow 0-based: row 0 = header, so data row index = excelFromRow - 1
        const dataIdx = excelFromRow - 1;
        if (dataIdx >= 0) {
          rowImageMap.set(dataIdx, b64);
        }
      }
    } catch {
      // Not a valid ZIP, no drawings, or any other issue — silently ignore
    }
    return rowImageMap;
  }

  async findBySerialNumber(serialNumber: string): Promise<ProductDocument> {
    const product = await this.productModel
      .findOne({ serialNumber: serialNumber.trim() })
      .exec();
    if (!product)
      throw new NotFoundException(
        `Product with serial number "${serialNumber}" not found.`,
      );
    return product;
  }

  /** Import products from an uploaded CSV or Excel buffer. */
  async importFromFile(
    buffer: Buffer,
    mimetype: string,
  ): Promise<{
    imported: number;
    skipped: number;
    errors: { row: number; message: string }[];
  }> {
    // Parse workbook
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
      throw new BadRequestException(
        "Could not parse file. Upload a valid CSV or Excel file.",
      );
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    });

    if (rows.length === 0) {
      throw new BadRequestException("The file is empty or has no data rows.");
    }

    // Extract images embedded in xlsx cells (no-op for CSV — returns empty Map)
    const rowImageMap = this.extractImagesFromXlsx(buffer);

    const REQUIRED = [
      "name",
      "serialNumber",
      "rentPrice",
      "sellingPrice",
      "purchasePrice",
    ];
    const VALID_CATEGORIES = Object.values(ProductCategory) as string[];

    const errors: { row: number; message: string }[] = [];
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-based + header row
      const row = rows[i];
      // Normalise keys: trim whitespace, lowercase first char
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        const key = k.trim().replace(/\s+/g, "");
        // camelCase first letter
        norm[key.charAt(0).toLowerCase() + key.slice(1)] = String(
          v ?? "",
        ).trim();
      }

      // Required field check
      const missing = REQUIRED.filter((f) => !norm[f]);
      if (missing.length) {
        errors.push({
          row: rowNum,
          message: `Missing required fields: ${missing.join(", ")}`,
        });
        skipped++;
        continue;
      }

      // Numeric validation
      const rentPrice = parseFloat(norm["rentPrice"]);
      const sellingPrice = parseFloat(norm["sellingPrice"]);
      const purchasePrice = parseFloat(norm["purchasePrice"]);

      if (isNaN(rentPrice) || rentPrice < 0) {
        errors.push({
          row: rowNum,
          message: "rentPrice must be a non-negative number.",
        });
        skipped++;
        continue;
      }
      if (isNaN(sellingPrice) || sellingPrice < 0) {
        errors.push({
          row: rowNum,
          message: "sellingPrice must be a non-negative number.",
        });
        skipped++;
        continue;
      }
      if (isNaN(purchasePrice) || purchasePrice < 0) {
        errors.push({
          row: rowNum,
          message: "purchasePrice must be a non-negative number.",
        });
        skipped++;
        continue;
      }

      // Category validation
      let category: ProductCategory | undefined;
      if (norm["category"]) {
        const cat = norm["category"].toLowerCase().replace(/\s+/g, "_");
        if (!VALID_CATEGORIES.includes(cat)) {
          errors.push({
            row: rowNum,
            message: `Invalid category "${norm["category"]}". Valid values: ${VALID_CATEGORIES.join(", ")}`,
          });
          skipped++;
          continue;
        }
        category = cat as ProductCategory;
      }

      // Duplicate serial number check (in DB)
      const existing = await this.productModel
        .findOne({ serialNumber: norm["serialNumber"] })
        .exec();
      if (existing) {
        errors.push({
          row: rowNum,
          message: `Serial number "${norm["serialNumber"]}" already exists — skipped.`,
        });
        skipped++;
        continue;
      }

      // Determine imageUrl: embedded Excel image takes priority over any text URL
      const imageUrl = rowImageMap.get(i) ?? (norm["imageUrl"] || "");

      // Insert
      const product = new this.productModel({
        name: norm["name"],
        serialNumber: norm["serialNumber"],
        imageUrl,
        rentPrice,
        sellingPrice,
        purchasePrice,
        category,
        isActive: true,
      });
      await product.save();
      imported++;
    }

    return { imported, skipped, errors };
  }
}
