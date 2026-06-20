import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model, Types } from "mongoose";
import {
  Expense,
  ExpenseDocument,
  ExpenseCategory,
  ExpenseStatus,
} from "./schemas/expense.schema";
import { Product, ProductDocument } from "../products/schemas/product.schema";
import { Party, PartyDocument } from "../parties/schemas/party.schema";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { SearchExpenseDto } from "./dto/search-expense.dto";

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Party.name) private partyModel: Model<PartyDocument>,
  ) {}

  // ── Auto-generate EXP-XXXX ────────────────────────────────────
  private async generateExpenseNo(): Promise<string> {
    const last = await this.expenseModel
      .findOne({ expenseNo: { $regex: /^EXP-\d+$/ } })
      .sort({ expenseNo: -1 })
      .select("expenseNo")
      .exec();

    let next = 1;
    if (last?.expenseNo) {
      const num = parseInt(last.expenseNo.split("-")[1], 10);
      if (!isNaN(num)) next = num + 1;
    }
    return `EXP-${String(next).padStart(4, "0")}`;
  }

  // ── Default initial status per category ──────────────────────
  private defaultStatus(category: string): string {
    return ExpenseStatus.SENT;
  }

  // ── Create ────────────────────────────────────────────────────
  async create(dto: CreateExpenseDto): Promise<Expense> {
    const totalQuantity = dto.items.reduce((s, i) => s + i.quantity, 0);
    const totalPrice = totalQuantity * dto.perPiecePrice;
    const expenseNo = await this.generateExpenseNo();
    const status = this.defaultStatus(dto.category);

    const expense = new this.expenseModel({
      ...dto,
      expenseNo,
      totalQuantity,
      totalPrice,
      status,
    });
    return expense.save();
  }

  // ── List / Search ──────────────────────────────────────────────
  async search(query: SearchExpenseDto): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10", 10)));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<ExpenseDocument> = { isDeleted: { $ne: true } };

    if (query.partyId) {
      filter.party = new Types.ObjectId(query.partyId);
    }
    if (query.category) {
      filter.category = query.category;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.fromDate || query.toDate) {
      filter.createdAt = {};
      if (query.fromDate) filter.createdAt.$gte = new Date(query.fromDate);
      if (query.toDate) {
        const to = new Date(query.toDate);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }
    if (query.search?.trim()) {
      filter.expenseNo = { $regex: query.search.trim(), $options: "i" };
    }

    const [data, total] = await Promise.all([
      this.expenseModel
        .find(filter)
        .populate("party", "name")
        .populate("items.product", "name serialNumber imageUrl category")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.expenseModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Get by party ───────────────────────────────────────────────
  async findByParty(partyId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const filter: FilterQuery<ExpenseDocument> = {
      isDeleted: { $ne: true },
      party: new Types.ObjectId(partyId),
    };
    const [data, total] = await Promise.all([
      this.expenseModel
        .find(filter)
        .populate("party", "name")
        .populate("items.product", "name serialNumber imageUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.expenseModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Get by product ─────────────────────────────────────────────
  async findByProduct(productId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const filter: FilterQuery<ExpenseDocument> = {
      isDeleted: { $ne: true },
      "items.product": new Types.ObjectId(productId),
    };
    const [data, total] = await Promise.all([
      this.expenseModel
        .find(filter)
        .populate("party", "name")
        .populate("items.product", "name serialNumber imageUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.expenseModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Total expense amount for a product ────────────────────────
  async getTotalByProduct(productId: string): Promise<{ total: number }> {
    const result = await this.expenseModel.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          "items.product": new Types.ObjectId(productId),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$perPiecePrice" },
        },
      },
    ]);
    return { total: result.length > 0 ? result[0].total : 0 };
  }

  // ── Summary stats ──────────────────────────────────────────────
  async getSummary() {
    const base: FilterQuery<ExpenseDocument> = { isDeleted: { $ne: true } };
    const [byCategory, pendingReturns] = await Promise.all([
      this.expenseModel.aggregate([
        { $match: base },
        {
          $group: {
            _id: "$category",
            totalExpense: { $sum: "$totalPrice" },
            count: { $sum: 1 },
          },
        },
      ]),
      this.expenseModel.countDocuments({
        ...base,
        status: {
          $in: [
            ExpenseStatus.SENT,
            "sent_for_washing",
            "washing_in_progress",
            "sent_for_stitching",
            "stitching_in_progress",
            "sent_for_blouse_stitching",
            "blouse_stitching_in_progress",
            "sent",
            "in_progress",
          ],
        },
      }),
    ]);

    const result: Record<string, number> = {
      washing: 0,
      stitching: 0,
      blouse_stitching: 0,
      pendingReturns,
    };
    for (const row of byCategory) {
      result[row._id] = row.totalExpense;
    }
    return result;
  }

  // ── Find one ───────────────────────────────────────────────────
  async findOne(id: string): Promise<Expense> {
    const expense = await this.expenseModel
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .populate("party", "name")
      .populate("items.product", "name serialNumber imageUrl category")
      .exec();
    if (!expense) throw new NotFoundException(`Expense "${id}" not found.`);
    return expense;
  }

  // ── Update ────────────────────────────────────────────────────
  async update(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const updateData: any = { ...dto };

    // Recalculate totals if items or price changed
    if (dto.items !== undefined || dto.perPiecePrice !== undefined) {
      const existing = await this.expenseModel.findById(id).exec();
      if (!existing) throw new NotFoundException(`Expense "${id}" not found.`);

      const items = dto.items ?? (existing.items as any);
      const perPiecePrice = dto.perPiecePrice ?? existing.perPiecePrice;
      const totalQuantity = items.reduce(
        (s: number, i: any) => s + i.quantity,
        0,
      );
      const totalPrice = totalQuantity * perPiecePrice;

      updateData.totalQuantity = totalQuantity;
      updateData.totalPrice = totalPrice;
    }

    const updated = await this.expenseModel
      .findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, updateData, {
        new: true,
      })
      .populate("party", "name")
      .populate("items.product", "name serialNumber imageUrl category")
      .exec();
    if (!updated) throw new NotFoundException(`Expense "${id}" not found.`);
    return updated;
  }

  // ── Update status only ────────────────────────────────────────
  async updateStatus(id: string, status: string): Promise<Expense> {
    const updated = await this.expenseModel
      .findOneAndUpdate(
        { _id: id, isDeleted: { $ne: true } },
        { status },
        { new: true },
      )
      .populate("party", "name")
      .populate("items.product", "name serialNumber imageUrl")
      .exec();
    if (!updated) throw new NotFoundException(`Expense "${id}" not found.`);
    return updated;
  }

  // ── Soft delete ───────────────────────────────────────────────
  async remove(id: string): Promise<void> {
    const result = await this.expenseModel
      .findByIdAndUpdate(id, { isDeleted: true })
      .exec();
    if (!result) throw new NotFoundException(`Expense "${id}" not found.`);
  }
  // ── Find Active Expense By Serial ──────────────────────────────
  async findActiveExpenseBySerial(
    serialNumber: string,
  ): Promise<Expense | null> {
    const product = await this.productModel.findOne({ serialNumber }).exec();
    if (!product) return null;

    return this.expenseModel
      .findOne({
        isDeleted: { $ne: true },
        status: { $ne: ExpenseStatus.RETURNED },
        items: {
          $elemMatch: {
            product: product._id,
            isReturned: { $ne: true },
          },
        },
      })
      .populate("party", "name")
      .populate("items.product", "serialNumber name")
      .exec();
  }
}
