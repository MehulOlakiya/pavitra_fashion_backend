import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as XLSX from "xlsx";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import {
  Product,
  ProductDocument,
  ProductCategory,
} from "./schemas/product.schema";
import { BookingsService } from "../bookings/bookings.service";
import { ExpensesService } from "../expenses/expenses.service";

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

export interface ProductInsights {
  totalRevenue: number;
  rentalCount: number;
  profit: number;
  totalExpense: number;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly bookingsService: BookingsService,
    private readonly expensesService: ExpensesService,
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

  /**
   * Bulk-create multiple products. Returns counts of inserted, skipped (duplicate),
   * and an array of per-item error messages.
   */
  async bulkCreate(dtos: CreateProductDto[]): Promise<{
    inserted: number;
    skipped: number;
    errors: { index: number; serialNumber: string; message: string }[];
  }> {
    let inserted = 0;
    let skipped = 0;
    const errors: { index: number; serialNumber: string; message: string }[] = [];

    for (let i = 0; i < dtos.length; i++) {
      const dto = dtos[i];
      try {
        const existing = await this.productModel
          .findOne({ serialNumber: dto.serialNumber })
          .exec();
        if (existing) {
          skipped++;
          errors.push({
            index: i,
            serialNumber: dto.serialNumber,
            message: `Serial number "${dto.serialNumber}" already exists.`,
          });
          continue;
        }
        const product = new this.productModel(dto);
        await product.save();
        inserted++;
      } catch (err: any) {
        skipped++;
        errors.push({
          index: i,
          serialNumber: dto.serialNumber,
          message: err?.message ?? 'Unknown error',
        });
      }
    }

    return { inserted, skipped, errors };
  }

  async findAll(
    params: {
      page?: number;
      limit?: number;
      category?: string;
      search?: string;
      serialNumbers?: string[];
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
    if (params.serialNumbers && params.serialNumbers.length > 0) {
      filter["serialNumber"] = { $in: params.serialNumbers };
    }

    const aggregatePipeline: any[] = [
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "bookings",
          let: { serial: "$serialNumber" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$isDeleted", true] },
                    { $ne: ["$status", "cancelled"] },
                    {
                      $or: [
                        { $eq: ["$productSerialNumber", "$$serial"] },
                        { $in: ["$$serial", { $ifNull: ["$items.serialNumber", []] }] }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "bookings",
        }
      },
      {
        $addFields: {
          rentCount: { $size: "$bookings" },
          totalRevenue: {
            $sum: {
              $map: {
                input: "$bookings",
                as: "b",
                in: { $ifNull: ["$$b.totalPayment", { $add: [{ $ifNull: ["$$b.advancePayment", 0] }, { $ifNull: ["$$b.remainingPayment", 0] }] }] }
              }
            }
          }
        }
      },
      {
        $addFields: {
          profit: {
            $subtract: ["$totalRevenue", { $ifNull: ["$purchasePrice", 0] }]
          }
        }
      },
      {
        $project: {
          bookings: 0
        }
      }
    ];

    const [data, total] = await Promise.all([
      this.productModel.aggregate(aggregatePipeline).exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);

    return { data: data as ProductDocument[], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getAnalytics(startDate?: Date, endDate?: Date): Promise<ProductAnalytics> {
    let matchStage: any = { isArchived: false };
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = startDate;
      if (endDate) matchStage.createdAt.$lte = endDate;
    }

    const [groups, categories] = await Promise.all([
      this.productModel
        .aggregate<{
          _id: boolean;
          count: number;
        }>([
          { $match: matchStage },
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

  /**
   * GET /products/:id/insights
   * Returns server-calculated analytics for a single product:
   * totalRevenue, rentalCount, profit (revenue − purchasePrice), totalExpense.
   */
  async getInsights(id: string): Promise<ProductInsights> {
    const product = await this.findOne(id);

    const [bookingAgg, expenseResult] = await Promise.all([
      // Aggregate bookings for this product's serial number
      (this.productModel as any).db
        .collection("bookings")
        .aggregate([
          {
            $match: {
              isDeleted: { $ne: true },
              status: { $ne: "cancelled" },
              $or: [
                { productSerialNumber: product.serialNumber },
                { "items.serialNumber": product.serialNumber },
              ],
            },
          },
          {
            $group: {
              _id: null,
              rentalCount: { $sum: 1 },
              totalRevenue: {
                $sum: {
                  $ifNull: [
                    "$totalPayment",
                    { $add: [{ $ifNull: ["$advancePayment", 0] }, { $ifNull: ["$remainingPayment", 0] }] },
                  ],
                },
              },
            },
          },
        ])
        .toArray() as Promise<{ rentalCount: number; totalRevenue: number }[]>,

      // Reuse existing expense aggregation
      this.expensesService.getTotalByProduct(id),
    ]);

    const rentalCount: number = bookingAgg[0]?.rentalCount ?? 0;
    const totalRevenue: number = bookingAgg[0]?.totalRevenue ?? 0;
    const totalExpense: number = expenseResult.total;
    const profit: number = totalRevenue - (product.purchasePrice ?? 0);

    return { totalRevenue, rentalCount, profit, totalExpense };
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
   * Returns paginated products that are available (not booked) in the given
   * [from, to] date range. Only active, non-archived products are included.
   */
  async findAvailable(params: {
    from: Date;
    to: Date;
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  }): Promise<PaginatedProducts> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 10));
    const skip = (page - 1) * limit;

    const bookedSerials = await this.bookingsService.getBookedSerials(
      params.from,
      params.to,
    );

    const filter: Record<string, unknown> = {
      isArchived: false,
      isActive: true,
    };
    if (bookedSerials.length) {
      filter["serialNumber"] = { $nin: bookedSerials };
    }
    if (params.category) filter["category"] = params.category;
    if (params.search) {
      const regex = { $regex: params.search.trim(), $options: "i" };
      filter["$or"] = [
        { name: regex },
        { serialNumber: regex },
        { category: regex },
      ];
    }

    const aggregatePipeline: any[] = [
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "bookings",
          let: { serial: "$serialNumber" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$isDeleted", true] },
                    { $ne: ["$status", "cancelled"] },
                    {
                      $or: [
                        { $eq: ["$productSerialNumber", "$$serial"] },
                        { $in: ["$$serial", { $ifNull: ["$items.serialNumber", []] }] }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "bookings",
        }
      },
      {
        $addFields: {
          rentCount: { $size: "$bookings" },
          totalRevenue: {
            $sum: {
              $map: {
                input: "$bookings",
                as: "b",
                in: { $ifNull: ["$$b.totalPayment", { $add: [{ $ifNull: ["$$b.advancePayment", 0] }, { $ifNull: ["$$b.remainingPayment", 0] }] }] }
              }
            }
          }
        }
      },
      {
        $addFields: {
          profit: {
            $subtract: ["$totalRevenue", { $ifNull: ["$purchasePrice", 0] }]
          }
        }
      },
      {
        $project: {
          bookings: 0
        }
      }
    ];

    const [data, total] = await Promise.all([
      this.productModel.aggregate(aggregatePipeline).exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);

    return { data: data as ProductDocument[], total, page, limit, totalPages: Math.ceil(total / limit) };
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

    const REQUIRED = ["serialNumber", "rentPrice", "category"];
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

      // Numeric validation (only required field is rentPrice)
      const rentPrice = parseFloat(norm["rentPrice"]);
      if (isNaN(rentPrice) || rentPrice < 0) {
        errors.push({
          row: rowNum,
          message: "rentPrice must be a non-negative number.",
        });
        skipped++;
        continue;
      }
      if (norm["sellingPrice"]) {
        const v = parseFloat(norm["sellingPrice"]);
        if (isNaN(v) || v < 0) {
          errors.push({
            row: rowNum,
            message: "sellingPrice must be a non-negative number.",
          });
          skipped++;
          continue;
        }
      }
      if (norm["purchasePrice"]) {
        const v = parseFloat(norm["purchasePrice"]);
        if (isNaN(v) || v < 0) {
          errors.push({
            row: rowNum,
            message: "purchasePrice must be a non-negative number.",
          });
          skipped++;
          continue;
        }
      }

      // Category validation (required)
      const rawCat = norm["category"];
      if (!rawCat) {
        errors.push({
          row: rowNum,
          message: "Missing required field: category",
        });
        skipped++;
        continue;
      }
      let category: ProductCategory;
      {
        const cat = rawCat.toLowerCase().replace(/\s+/g, "_");
        if (!VALID_CATEGORIES.includes(cat)) {
          errors.push({
            row: rowNum,
            message: `Invalid category "${rawCat}". Valid values: ${VALID_CATEGORIES.join(", ")}`,
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

      // Determine imageUrl from text column only
      const imageUrl = norm["imageUrl"] || undefined;

      // Insert
      const product = new this.productModel({
        name: norm["name"] || undefined,
        serialNumber: norm["serialNumber"],
        imageUrl,
        rentPrice,
        sellingPrice: norm["sellingPrice"]
          ? parseFloat(norm["sellingPrice"])
          : undefined,
        purchasePrice: norm["purchasePrice"]
          ? parseFloat(norm["purchasePrice"])
          : undefined,
        category,
        isActive: true,
      });
      await product.save();
      imported++;
    }

    return { imported, skipped, errors };
  }
}
