import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import * as puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import chromium from "@sparticuz/chromium";
import { Booking } from "../bookings/schemas/booking.schema";

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generateInvoice(booking: any): Promise<Buffer> {
    try {
      const isServerless =
        !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
      const executablePath = isServerless
        ? await chromium.executablePath()
        : undefined;

      const browser = await puppeteer.launch({
        ...(executablePath ? { executablePath } : {}),
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          ...(isServerless ? chromium.args : []),
        ],
      });
      const page = await browser.newPage();

      const htmlContent = this.getHtmlTemplate(booking);

      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
        },
      });

      await browser.close();

      // Puppeteer returns Uint8Array in newer versions, ensure it's a Buffer
      return Buffer.from(pdfBuffer);
    } catch (error) {
      this.logger.error("Failed to generate PDF", error);
      throw new InternalServerErrorException("Failed to generate PDF invoice");
    }
  }

  private getHtmlTemplate(booking: any): string {
    const customer = booking.customer || {};
    const billGenerationDate = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const bookingDateStr = new Date(booking.bookingDate).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      },
    );
    const returnDateStr = new Date(booking.returnDate).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      },
    );
    const invoiceNo = booking?.orderId.split("-")[1];

    // Map items
    const items =
      booking.items && booking.items.length > 0
        ? booking.items
        : booking.productSerialNumber
          ? [
              {
                product: {
                  name: "Rented Item (" + booking.productSerialNumber + ")",
                  rentPrice: 0,
                },
                quantity: 1,
              },
            ]
          : [];

    let itemsHtml = "";
    let subTotal = 0;
    let rowIndex = 1;
    let bookingFreshPieceApplied = false;

    items.forEach((item: any) => {
      const name = item.product?.name || item.serialNumber || "Product";
      const qty = item.quantity || 1;
      const price = item.product?.rentPrice || 0;
      let total = price * qty;

      let beltText = "No";
      if (item.beltType) {
        beltText =
          item.beltType === "HB"
            ? "HF"
            : item.beltType === "FB"
              ? "BF"
              : item.beltType;
      }

      let freshPieceText = "No";
      let itemFpCost = 0;

      if (item.freshPiece) {
        itemFpCost = item.freshPieceCost || 0;
        freshPieceText = itemFpCost > 0 ? `Yes (+₹${itemFpCost})` : "Yes";
      } else if (booking.freshPiece && !bookingFreshPieceApplied) {
        itemFpCost = booking.freshPieceCost || 0;
        freshPieceText = itemFpCost > 0 ? `Yes (+₹${itemFpCost})` : "Yes";
        bookingFreshPieceApplied = true;
      }

      total += itemFpCost;
      subTotal += total;

      itemsHtml += `
        <tr>
          <td class="center">${rowIndex++}</td>
          <td class="item-name">${name}</td>
          <td class="center">${beltText}</td>
          <td class="center">${freshPieceText}</td>
          <td class="center">${qty}</td>
          <td class="right">₹${price}</td>
          <td class="right">₹${total}</td>
        </tr>
      `;
    });

    const advancePayment = booking.advancePayment || 0;
    const remainingPayment = booking.remainingPayment || 0;
    const grandTotal = advancePayment + remainingPayment;

    // Calculate a derived discount if subTotal doesn't match grandTotal and subTotal > grandTotal
    const discount = subTotal > grandTotal ? subTotal - grandTotal : 0;

    // If subTotal was 0 (no rentPrices found), let's just use grandTotal as subTotal
    if (subTotal === 0 && grandTotal > 0) {
      subTotal = grandTotal;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');
          
          :root {
            --primary: #546FFF;
            --primary-light: #EEF2FF;
            --text-main: #0F172A;
            --text-muted: #64748B;
            --border-color: #E2E8F0;
            --bg-light: #F8FAFC;
          }

          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 0;
            color: var(--text-main);
            background: #fff;
            -webkit-print-color-adjust: exact;
          }
          
          .container {
            padding: 40px 50px;
            max-width: 800px;
            margin: 0 auto;
          }
          
          /* Header */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            padding-bottom: 30px;
            border-bottom: 2px solid var(--primary-light);
          }
          
          .header-left {
            max-width: 60%;
          }
          
          .logo-area {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
          }
          
          .logo-mark {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            transform: skewX(-10deg);
            width: 40px;
          }
          .logo-mark div {
            width: 18px;
            height: 18px;
            background: var(--primary);
            border-radius: 2px;
          }
          .logo-mark div:nth-child(2) {
            background: #8499FF;
            margin-top: 8px;
          }
          .logo-mark div:nth-child(3) {
            margin-top: -8px;
          }
          
          .logo-text h1 {
            font-family: 'Poppins', sans-serif;
            margin: 0;
            color: var(--primary);
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 0.5px;
            line-height: 1.1;
          }
          .logo-text p {
            font-family: 'Poppins', sans-serif;
            margin: 0;
            font-size: 11px;
            color: var(--text-muted);
            letter-spacing: 2px;
            font-weight: 600;
          }
          
          .company-details-table {
            font-size: 12px;
            line-height: 1.6;
            color: var(--text-muted);
            border-collapse: collapse;
          }
          .company-details-table td {
            vertical-align: top;
            padding: 2px 8px 2px 0;
          }
          .company-details-table strong {
            color: var(--text-main);
            font-weight: 600;
            white-space: nowrap;
          }
          
          /* Header Right */
          .header-right {
            text-align: right;
          }
          
          .invoice-title {
            font-family: 'Poppins', sans-serif;
            margin: 0 0 15px 0;
            font-size: 36px;
            font-weight: 800;
            letter-spacing: 2px;
            color: var(--primary);
          }
          
          .invoice-meta {
            display: inline-flex;
            flex-direction: column;
            gap: 8px;
            text-align: left;
            background: var(--bg-light);
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            min-width: 180px;
          }
          
          /* Customer Section */
          .customer-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            gap: 20px;
          }
          
          .section-title {
            font-family: 'Poppins', sans-serif;
            font-size: 11px;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 12px 0;
          }
          
          .bill-to, .booking-details {
            flex: 1;
          }
          
          .booking-details {
            background: var(--primary-light);
            padding: 16px 20px;
            border-radius: 8px;
          }
          
          .customer-name {
            font-family: 'Poppins', sans-serif;
            font-size: 18px;
            font-weight: 700;
            color: var(--text-main);
            margin: 0 0 6px 0;
            text-transform: capitalize;
          }
          
          .bill-to p {
            margin: 4px 0;
            font-size: 13px;
            color: var(--text-muted);
          }
          
          .meta-item {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            margin-bottom: 6px;
          }
          .meta-item:last-child {
            margin-bottom: 0;
          }
          .meta-item span {
            color: var(--text-muted);
          }
          .meta-item strong {
            color: var(--text-main);
            font-weight: 600;
          }
          
          /* Table */
          .table-wrapper {
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border-color);
            margin-bottom: 30px;
          }
          
          .modern-table {
            width: 100%;
            border-collapse: collapse;
          }
          
          .modern-table thead {
            background: var(--bg-light);
          }
          
          .modern-table th {
            padding: 12px 16px;
            font-family: 'Poppins', sans-serif;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
          }
          
          .modern-table td {
            padding: 14px 16px;
            font-size: 13px;
            color: var(--text-main);
            border-bottom: 1px solid var(--border-color);
          }
          
          .modern-table tr:last-child td {
            border-bottom: none;
          }
          
          .modern-table th.center, .modern-table td.center {
            text-align: center;
          }
          
          .modern-table th.right, .modern-table td.right {
            text-align: right;
          }
          
          .item-name {
            font-weight: 600;
            color: var(--text-main);
          }
          
          /* Totals Section */
          .totals-wrapper {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
          }
          
          .payment-info {
            width: 45%;
            background: var(--bg-light);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
          }
          
          .payment-info h4 {
            font-family: 'Poppins', sans-serif;
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 700;
            color: var(--text-main);
          }
          
          .totals-box {
            width: 45%;
          }
          
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 16px;
            font-size: 14px;
            color: var(--text-muted);
          }
          
          .totals-row strong {
            color: var(--text-main);
            font-weight: 600;
          }
          
          .grand-total-row {
            display: flex;
            justify-content: space-between;
            padding: 16px;
            margin-top: 8px;
            background: var(--primary);
            border-radius: 8px;
            color: #fff;
            font-family: 'Poppins', sans-serif;
            font-size: 16px;
            font-weight: 700;
            box-shadow: 0 4px 6px -1px rgba(84, 111, 255, 0.2);
          }
          
          .grand-total-row strong {
            color: #fff;
          }
          
          /* Footer */
          .footer {
            margin-top: 40px;
            border-top: 2px solid var(--primary-light);
            padding-top: 30px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          
          .terms {
            max-width: 60%;
          }
          
          .terms h4 {
            font-family: 'Poppins', sans-serif;
            margin: 0 0 8px 0;
            font-size: 12px;
            font-weight: 700;
            color: var(--text-main);
          }
          
          .terms p {
            margin: 0;
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.6;
          }
          
          .thank-you {
            text-align: right;
          }
          
          .thank-you p.title {
            font-family: 'Poppins', sans-serif;
            font-size: 18px;
            font-weight: 700;
            color: var(--primary);
            margin: 0 0 4px 0;
          }
          
          .thank-you p.subtitle {
            font-size: 11px;
            color: var(--text-muted);
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <header class="header">
            <div class="header-left">
              <div class="logo-area">
                <div class="logo-mark">
                  <div></div><div></div><div></div><div></div>
                </div>
                <div class="logo-text">
                  <h1>PAVITRA FASHION</h1>
                  <p>SALES & RENTALS</p>
                </div>
              </div>
              <table class="company-details-table">
                <tr>
                  <td><strong>Address:</strong></td>
                  <td>Pavitra fashion, Kashipara plazza, near bus stand, sardhar - 360025</td>
                </tr>
                <tr>
                  <td><strong>Phone:</strong></td>
                  <td>9023908281 &nbsp;|&nbsp; <strong>Mail:</strong> pavitrafashionsardhar@gmail.com</td>
                </tr>
                <tr>
                  <td><strong>GSTIN:</strong></td>
                  <td>24JAPPS495B1ZA</td>
                </tr>
              </table>
            </div>
            <div class="header-right">
              <h2 class="invoice-title">INVOICE</h2>
              <div class="invoice-meta">
                <div class="meta-item">
                  <span>Invoice No:</span>
                  <strong>${invoiceNo}</strong>
                </div>
                <div class="meta-item">
                  <span>Issue Date:</span>
                  <strong>${billGenerationDate}</strong>
                </div>
              </div>
            </div>
          </header>

          <!-- Customer Section -->
          <div class="customer-section">
            <div class="bill-to">
              <h3 class="section-title">Bill To</h3>
              <p class="customer-name">${customer.name || "Unknown Customer"}</p>
              <p>${customer.village || "N/A"}</p>
              <p>Mobile: ${customer.mobileNumber || "N/A"}</p>
            </div>
            <div class="booking-details">
              <h3 class="section-title" style="color: var(--primary)">Booking Details</h3>
              <div class="meta-item">
                <span>Booking Date:</span>
                <strong>${bookingDateStr}</strong>
              </div>
              <div class="meta-item" style="margin-top: 8px;">
                <span>Return Date:</span>
                <strong>${returnDateStr}</strong>
              </div>
            </div>
          </div>

          <!-- Table -->
          <div class="table-wrapper">
            <table class="modern-table">
              <thead>
                <tr>
                  <th width="5%" class="center">#</th>
                  <th width="35%">Description</th>
                  <th width="12%" class="center">Belt</th>
                  <th width="15%" class="center">Fresh Piece</th>
                  <th width="8%" class="center">Qty</th>
                  <th width="12%" class="right">Price</th>
                  <th width="13%" class="right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- Totals Layout -->
          <div class="totals-wrapper">
            <div class="payment-info">
              <h4>Payment Status</h4>
              <div class="meta-item">
                <span>Advance Payment:</span>
                <strong>₹${advancePayment}</strong>
              </div>
              <div class="meta-item" style="margin-top: 8px;">
                <span>Remaining Payment:</span>
                <strong style="color: var(--primary)">₹${remainingPayment}</strong>
              </div>
            </div>
            
            <div class="totals-box">
              <div class="totals-row">
                <span>Subtotal</span>
                <strong>₹${subTotal}</strong>
              </div>
              ${
                discount > 0
                  ? `
              <div class="totals-row">
                <span>Discount</span>
                <strong>- ₹${discount}</strong>
              </div>
              `
                  : ""
              }
              <div class="grand-total-row">
                <span>Grand Total</span>
                <strong>₹${grandTotal}</strong>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <div class="terms">
              <h4>Terms & Conditions</h4>
              <p>Please send payment within 30 days of receiving this invoice.<br>There will be 10% interest charge per month on late invoice.</p>
            </div>
            <div class="thank-you">
              <p class="title">Thank You!</p>
              <p class="subtitle">We appreciate your business.</p>
            </div>
          </div>

        </div>
      </body>
      </html>
    `;
  }
}
