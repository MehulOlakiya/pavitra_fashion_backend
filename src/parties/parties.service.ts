import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Party, PartyDocument } from "./schemas/party.schema";
import { CreatePartyDto } from "./dto/create-party.dto";
import { UpdatePartyDto } from "./dto/update-party.dto";

@Injectable()
export class PartiesService {
  constructor(
    @InjectModel(Party.name) private partyModel: Model<PartyDocument>,
  ) {}

  async create(dto: CreatePartyDto): Promise<Party> {
    const party = new this.partyModel(dto);
    return party.save();
  }

  async findAll(
    search?: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: Party[]; total: number; page: number; limit: number; totalPages: number }> {
    const skip = (page - 1) * limit;
    const filter: any = { isDeleted: { $ne: true } };
    if (search?.trim()) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }

    const [data, total] = await Promise.all([
      this.partyModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit).exec(),
      this.partyModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Party> {
    const party = await this.partyModel.findOne({ _id: id, isDeleted: { $ne: true } }).exec();
    if (!party) throw new NotFoundException(`Party "${id}" not found.`);
    return party;
  }

  async update(id: string, dto: UpdatePartyDto): Promise<Party> {
    const updated = await this.partyModel
      .findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, dto, { new: true })
      .exec();
    if (!updated) throw new NotFoundException(`Party "${id}" not found.`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.partyModel
      .findByIdAndUpdate(id, { isDeleted: true })
      .exec();
    if (!result) throw new NotFoundException(`Party "${id}" not found.`);
  }
}
