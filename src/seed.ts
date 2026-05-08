/**
 * Seed script — creates the default admin user and product catalogue in MongoDB.
 *
 * Run with:  npm run seed
 *
 * Default credentials seeded:
 *   email:    pavitra.fashion@gamail.com
 *   password: Pavitra@1234
 */
import * as mongoose from "mongoose";
import * as bcrypt from "bcrypt";
import * as dotenv from "dotenv";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const productsData: Array<{
  serialNumber: string;
  name: string;
  imageUrl: string;
  sellingPrice: number;
  rentPrice: number;
  category: string;
}> = require("./data/products.json");

dotenv.config();

const MONGO_URI =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/pavitra_fashion";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "manager", "staff"],
      default: "admin",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const UserModel = mongoose.model("User", UserSchema);

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
    serialNumber: { type: String, required: true, unique: true },
    sellingPrice: { type: Number, required: true },
    rentPrice: { type: Number, required: true },
    category: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const ProductModel = mongoose.model("Product", ProductSchema);

async function seed() {
  console.log("Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");

  const email = "pavitra.fashion@gamail.com";
  const existing = await UserModel.findOne({ email });

  if (existing) {
    console.log(`User "${email}" already exists — skipping seed.`);
  } else {
    const hashedPassword = await bcrypt.hash("Pavitra@1234", 12);
    await UserModel.create({
      name: "Pavitra Admin",
      email,
      password: hashedPassword,
      role: "admin",
      isActive: true,
    });
    console.log(`✓ Seeded user: ${email} / Pavitra@1234`);
  }

  // ── Products ───────────────────────────────────────────────────────────────
  let inserted = 0;
  let skipped = 0;

  for (const product of productsData) {
    const exists = await ProductModel.findOne({
      serialNumber: product.serialNumber,
    });
    if (exists) {
      skipped++;
    } else {
      await ProductModel.create(product);
      inserted++;
    }
  }

  console.log(
    `✓ Products: ${inserted} inserted, ${skipped} already existed — skipped.`,
  );

  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
