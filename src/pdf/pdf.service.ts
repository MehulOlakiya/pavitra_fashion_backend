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
    const invoiceNo = booking._id.toString().slice(-6).toUpperCase();

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
          <td>${rowIndex++}</td>
          <td>${name}</td>
          <td>${beltText}</td>
          <td>${freshPieceText}</td>
          <td>${qty}</td>
          <td>₹${price}</td>
          <td>₹${total}</td>
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
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Great+Vibes&display=swap');
          
          body {
            font-family: 'Poppins', sans-serif;
            margin: 0;
            padding: 0;
            color: #1a1a1a;
            background: #fff;
          }
          .container {
            padding: 30px 40px;
          }
          
          /* Header / Logo Section */
          .top-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
          }
          .logo-area {
            display: flex;
            align-items: center;
            gap: 15px;
          }
          .logo-mark {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            transform: skewX(-15deg);
            width: 44px;
          }
          .logo-mark div {
            width: 20px;
            height: 20px;
            background: #546FFF;
          }
          .logo-mark div:nth-child(2) {
            background: #8499FF;
            margin-top: 8px;
          }
          .logo-mark div:nth-child(3) {
            margin-top: -8px;
          }
          .logo-text {
            line-height: 1.1;
          }
          .logo-text h1 {
            margin: 0;
            color: #546FFF;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: 1px;
          }
          .logo-text p {
            margin: 0;
            font-size: 10px;
            color: #1a1a1a;
            letter-spacing: 2px;
          }

          /* Invoice Title */
          .invoice-title {
            display: flex;
            align-items: center;
            margin-bottom: 40px;
          }
          .invoice-title-box {
            width: 40px;
            height: 32px;
            background-color: #546FFF;
            margin-right: 15px;
          }
          .invoice-title h2 {
            margin: 0;
            font-size: 32px;
            font-weight: 800;
            letter-spacing: 2px;
          }

          /* Info Section */
          .info-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
          }
          .info-block p {
            margin: 4px 0;
            font-size: 13px;
            color: #444;
          }
          .info-block strong {
            color: #1a1a1a;
            font-weight: 600;
          }

          /* Table */
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .table thead th {
            border-top: 2px solid #546FFF;
            border-bottom: 2px solid #546FFF;
            padding: 12px 10px;
            text-align: left;
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .table tbody td {
            padding: 16px 10px;
            font-size: 13px;
            border-bottom: 1px dashed #ccc;
          }
          .table tbody td:nth-child(3),
          .table tbody td:nth-child(4),
          .table tbody td:nth-child(5),
          .table tbody td:nth-child(6) {
            text-align: center;
          }
          .table tbody td:nth-child(7) {
            text-align: right;
          }

          /* Totals Layout */
          .totals-wrapper {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            margin-bottom: 20px;
          }
          .payment-info {
            width: 50%;
            padding-right: 20px;
          }
          .payment-info h4 {
            margin: 0 0 10px 0;
            font-size: 16px;
            font-weight: 800;
          }
          .payment-info p {
            margin: 4px 0;
            font-size: 13px;
            color: #666;
          }
          
          .totals-table {
            width: 40%;
            border-collapse: collapse;
          }
          .totals-table td {
            padding: 6px 10px;
            font-size: 13px;
            font-weight: 600;
            color: #1a1a1a;
          }
          .grand-total {
            background-color: #546FFF;
            color: #fff !important;
          }
          .grand-total td {
            color: #fff;
            font-weight: 700;
            padding: 12px 10px;
            font-size: 15px;
          }

          /* Terms and Signature */
          .terms-signature {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
          }
          .terms {
            width: 100%;
          }
          .terms h4 {
            margin: 0 0 10px 0;
            font-size: 15px;
            font-weight: 800;
          }
          .terms p {
            margin: 0;
            font-size: 12px;
            color: #666;
            line-height: 1.5;
          }

          /* Header Contact */
          .header-contact {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .header-contact-item {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .header-icon {
            color: #546FFF;
            width: 16px;
            height: 16px;
          }
          .header-contact-text h5 {
            margin: 0;
            color: #546FFF;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.2;
          }
          .header-contact-text p {
            margin: 0;
            font-size: 10px;
            color: #444;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Top Header -->
          <div class="top-header">
            <div class="logo-area">
              <div class="logo-mark">
                <div></div><div></div><div></div><div></div>
              </div>
              <div class="logo-text">
                <h1>PAVITRA<br>FASHION</h1>
                <p>SALES & RENTALS</p>
              </div>
            </div>
            <div class="header-contact">
              <div class="header-contact-item">
                <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
                <div class="header-contact-text">
                  <h5>Phone</h5>
                  <p>7202863032</p>
                </div>
              </div>
              <div class="header-contact-item">
                <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <div class="header-contact-text">
                  <h5>Mail</h5>
                  <p>pavitra.fashion@gmail.com</p>
                </div>
              </div>
              <div class="header-contact-item">
                <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>
                </svg>
                <div class="header-contact-text">
                  <h5>Address</h5>
                  <p>Pavitra fashion, sardhar</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Title -->
          <div class="invoice-title">
            <div class="invoice-title-box"></div>
            <h2>INVOICE</h2>
          </div>
          
          <!-- Info Section -->
          <div class="info-section">
            <div class="info-block">
              <p style="font-size: 14px; font-weight: 800; margin-bottom: 8px;">To</p>
              <p style="font-size: 18px; font-weight: 800; text-transform: uppercase;">${customer.name || "Unknown Customer"}</p>
              <p>Village/city: ${customer.village || "N/A"}</p>
              <p>Mobile: ${customer.mobileNumber || "N/A"}</p>
            </div>
            <div class="info-block" style="display: flex; align-items: flex-start; padding-top: 15px; margin-left: auto;">
              <table style="border-collapse: collapse; font-size: 12px; margin-left: auto;">
                <tr>
                  <td style="font-weight: 700; text-align: left; white-space: nowrap; padding: 4px 12px 4px 0; vertical-align: middle;">Invoice no:</td>
                  <td style="text-align: left; white-space: nowrap; padding: 4px 0; vertical-align: middle;">${invoiceNo}</td>
                </tr>
                <tr>
                  <td style="font-weight: 700; text-align: left; white-space: nowrap; padding: 4px 12px 4px 0; vertical-align: middle;">Date:</td>
                  <td style="text-align: left; white-space: nowrap; padding: 4px 0; vertical-align: middle;">${billGenerationDate}</td>
                </tr>
                <tr>
                  <td style="font-weight: 700; text-align: left; white-space: nowrap; padding: 4px 12px 4px 0; vertical-align: middle;">Booking Date:</td>
                  <td style="text-align: left; white-space: nowrap; padding: 4px 0; vertical-align: middle;">${bookingDateStr}</td>
                </tr>
                <tr>
                  <td style="font-weight: 700; text-align: left; white-space: nowrap; padding: 4px 12px 4px 0; vertical-align: middle;">Return Date:</td>
                  <td style="text-align: left; white-space: nowrap; padding: 4px 0; vertical-align: middle;">${returnDateStr}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Table -->
          <table class="table">
            <thead>
              <tr>
                <th width="5%">NO</th>
                <th width="35%">DESCRIPTION</th>
                <th width="10%" style="text-align: center;">BELT</th>
                <th width="15%" style="text-align: center;">FRESH PIECE</th>
                <th width="10%" style="text-align: center;">QTY</th>
                <th width="12%" style="text-align: center;">PRICE</th>
                <th width="13%" style="text-align: right;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Totals Layout -->
          <div class="totals-wrapper">
            <div class="payment-info">
              <h4>Payment</h4>
              <p><strong>Advance Payment: ₹${advancePayment}</strong></p>
              <p><strong>Remaining Payment: ₹${remainingPayment}</strong></p>
            </div>
            
            <table class="totals-table">
              <tr>
                <td>Sub Total</td>
                <td style="text-align: right;">₹${subTotal}</td>
              </tr>
              ${
                discount > 0
                  ? `
              <tr>
                <td>Discount</td>
                <td style="text-align: right;">₹${discount}</td>
              </tr>
              `
                  : ""
              }
              <tr class="grand-total">
                <td>GRAND TOTAL</td>
                <td style="text-align: right;">₹${grandTotal}</td>
              </tr>
            </table>
          </div>

          <!-- Terms & Signature -->
          <div class="terms-signature">
            <div class="terms">
              <h4>Term and Conditions :</h4>
              <p>Please send payment within 30 days of<br>receiving this invoice. There will be 10% interest<br>charge per month on late invoice.</p>
            </div>
          </div>

          <!-- Thank You Footer -->
          <div style="margin-top: 30px; text-align: center; border-top: 2px solid #546FFF; padding-top: 20px;">
            <p style="font-size: 22px; font-weight: 800; color: #546FFF; margin: 0 0 6px 0; letter-spacing: 1px;">Thank You for Shopping!</p>
            <p style="font-size: 12px; color: #888; margin: 0;">We appreciate your trust in Pavitra Fashion. We look forward to serving you again.</p>
          </div>

        </div>
      </body>
      </html>
    `;
  }
}
