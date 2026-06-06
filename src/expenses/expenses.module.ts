import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Expense, ExpenseSchema } from "./schemas/expense.schema";
import { Product, ProductSchema } from "../products/schemas/product.schema";
import { Party, PartySchema } from "../parties/schemas/party.schema";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Party.name, schema: PartySchema },
    ]),
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
