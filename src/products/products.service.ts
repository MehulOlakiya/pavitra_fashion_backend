import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { Product, ProductDocument } from "./schemas/product.schema";

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

  async findAll(category?: string): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = {
      isArchived: false,
    };
    if (category) filter["category"] = category;
    return this.productModel.find(filter).sort({ createdAt: -1 }).exec();
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
}
