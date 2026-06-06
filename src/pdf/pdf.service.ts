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
        format: "A5",
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

  private numberToWords(num: number): string {
    if (num === 0) return "Zero";
    const a = [
      "",
      "One ",
      "Two ",
      "Three ",
      "Four ",
      "Five ",
      "Six ",
      "Seven ",
      "Eight ",
      "Nine ",
      "Ten ",
      "Eleven ",
      "Twelve ",
      "Thirteen ",
      "Fourteen ",
      "Fifteen ",
      "Sixteen ",
      "Seventeen ",
      "Eighteen ",
      "Nineteen ",
    ];
    const b = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const inWords = (n: number): string => {
      if (n < 20) return a[n];
      if (n < 100)
        return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
      if (n < 1000)
        return (
          a[Math.floor(n / 100)] +
          "Hundred " +
          (n % 100 ? "and " + inWords(n % 100) : "")
        );
      if (n < 100000)
        return (
          inWords(Math.floor(n / 1000)) +
          "Thousand " +
          (n % 1000 ? inWords(n % 1000) : "")
        );
      if (n < 10000000)
        return (
          inWords(Math.floor(n / 100000)) +
          "Lakh " +
          (n % 100000 ? inWords(n % 100000) : "")
        );
      return (
        inWords(Math.floor(n / 10000000)) +
        "Crore " +
        (n % 10000000 ? inWords(n % 10000000) : "")
      );
    };

    return inWords(Math.floor(num)).trim() + " Rupees Only";
  }

  private getHtmlTemplate(booking: any): string {
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    };

    const customer = booking.customer || {};
    const billGenerationDate = new Date().toLocaleDateString("en-IN", dateOptions);
    const pickupTimeStr = booking.pickupTime ? ` (${booking.pickupTime})` : "";
    const bookingDateStr =
      new Date(booking.bookingDate).toLocaleDateString("en-IN", dateOptions) + pickupTimeStr;
    const returnTimeStr = booking.returnTime ? ` (${booking.returnTime})` : "";
    const returnDateStr =
      new Date(booking.returnDate).toLocaleDateString("en-IN", dateOptions) + returnTimeStr;
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
    let totalQty = 0;
    let bookingFreshPieceApplied = false;

    items.forEach((item: any) => {
      const name = item.product?.name || item.serialNumber || "Product";
      const qty = item.quantity || 1;
      const price = item.rentPrice ?? item.product?.rentPrice ?? 0;
      let total = price * qty;
      totalQty += qty;

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
          <td style="text-align:left">${name}</td>
          <td>${beltText}</td>
          <td>${freshPieceText}</td>
          <td>${qty}</td>
          <td style="text-align:right">₹ ${price.toFixed(2)}</td>
          <td style="text-align:right">₹ ${total.toFixed(2)}</td>
        </tr>
      `;
    });

    const advancePayment = booking.advancePayment || 0;
    const remainingPayment = booking.remainingPayment || 0;
    const grandTotal = subTotal;

    // Calculate a derived discount if subTotal doesn't match grandTotal and subTotal > grandTotal
    const discount = subTotal > grandTotal ? subTotal - grandTotal : 0;

    // If subTotal was 0 (no rentPrices found), let's just use grandTotal as subTotal
    if (subTotal === 0 && grandTotal > 0) {
      subTotal = grandTotal;
    }

    // Load Logo image as Base64
    let logoBase64 = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "Logo.jpeg");
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/jpeg;base64,${logoBuffer.toString("base64")}`;
      }
    } catch (err) {
      this.logger.error("Failed to load Logo.jpeg", err);
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;600&family=Roboto:wght@400;500;700&display=swap');
          @page { size: A5 landscape; margin: 0; }
          body { 
            font-family: 'Roboto', 'Noto Sans Gujarati', sans-serif; 
            margin: 0; 
            padding: 10px 20px; 
            font-size: 10px; 
            color: #000; 
            -webkit-print-color-adjust: exact; 
          }
          .bill-container { 
            border: 1px solid #000; 
            width: 100%; 
            box-sizing: border-box; 
          }
          .row { 
            display: flex; 
            border-bottom: 1px solid #000; 
          }
          .row:last-child { border-bottom: none; }
          .title-row { 
            justify-content: center; 
            padding: 4px; 
            font-size: 11px; 
          }
          
          .header-col-left { 
            flex: 1; 
            padding: 6px 12px; 
            display: flex; 
            align-items: center; 
            gap: 12px; 
          }
          .header-col-right { 
            width: 250px; 
            border-left: 1px solid #000; 
            padding: 6px 12px; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
            gap: 8px; 
            font-size: 10px;
          }
          
          img.logo-mark {
            width: 50px;
            height: 50px;
            object-fit: contain;
            border-radius: 4px;
            margin-right: 12px;
          }

          .logo-text-box h1 { 
            margin: 0; 
            font-size: 16px; 
            color: #204C8C; 
          }
          .logo-text-box p { 
            margin: 2px 0; 
            font-size: 9px; 
            color: #333;
          }
          .company-info { 
            display: grid; 
            grid-template-columns: 40px 1fr 40px 1fr; 
            gap: 2px 8px; 
            font-size: 9px; 
            margin-top: 6px; 
          }
          .company-info span.label { color: #555; }
          
          .bill-to-row { 
            padding: 6px 12px; 
            display: flex; 
            flex-direction: column; 
            gap: 4px; 
          }
          .bill-to-title { font-size: 10px; color: #333; }
          .customer-name { 
            font-weight: bold; 
            font-size: 12px; 
            text-transform: uppercase; 
            margin: 2px 0; 
          }
          
          table.items-table { 
            width: 100%; 
            border-collapse: collapse; 
            text-align: center; 
            font-size: 9px; 
          }
          table.items-table th { 
            border-bottom: 1px solid #000; 
            border-right: 1px solid #000; 
            padding: 6px 4px; 
          }
          table.items-table th:last-child { border-right: none; }
          table.items-table td { 
            border-bottom: 1px solid #000; 
            border-right: 1px solid #000; 
            padding: 6px 4px; 
          }
          table.items-table td:last-child { border-right: none; }
          table.items-table tr.total-row td { 
            font-weight: bold; 
            border-bottom: none; 
          }
          
          .summary-row { display: flex; }
          .summary-col { 
            flex: 1; 
            padding: 4px 12px; 
            border-right: 1px solid #000; 
          }
          .summary-col:last-child { border-right: none; }
          
          .bank-details { 
            padding: 6px 12px; 
            font-size: 9px; 
            line-height: 1.6; 
          }
          
          .footer-row { display: flex; min-height: 70px; }
          .footer-col-left { flex: 1; padding: 6px 12px; font-size: 9px; }
          .footer-col-right { 
            width: 300px; 
            border-left: 1px solid #000; 
            padding: 6px 12px; 
            display: flex; 
            flex-direction: column; 
            justify-content: space-between; 
            font-size: 9px; 
          }
        </style>
      </head>
      <body>
        <div class="bill-container">
          <div class="row title-row">Tax Invoice</div>
          
          <div class="row">
            <div class="header-col-left">
              ${logoBase64 ? `<img src="${logoBase64}" class="logo-mark" />` : '<div class="logo-mark" style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:#f4e8e1;border-radius:4px;color:#4a2c11;font-weight:bold;font-size:24px;margin-right:12px;">P</div>'}
              <div class="logo-text-box">
                <h1>PAVITRA CREATION</h1>
                <p>Pavitra Fashion, khashipra plaza near bus satnd sardhar, pincode - 360025</p>
                <div class="company-info">
                  <span class="label">Phone:</span> <span>9023908281</span>
                  <span class="label">Email:</span> <span>pavitrafashionsardhar@gmail.com</span>
                  <span class="label">GSTIN:</span> <span>24JAPPS495B1ZA</span>
                  <span class="label">State:</span> <span>24-Gujarat</span>
                </div>
              </div>
            </div>
            <div class="header-col-right">
              <div><span style="color:#555">Invoice No.:</span> <b>${invoiceNo}</b></div>
              <div><span style="color:#555">Date:</span> <b>${billGenerationDate}</b></div>
            </div>
          </div>
          
          <div class="row">
            <div class="bill-to-row" style="flex:1; border-right: 1px solid #000;">
              <div class="bill-to-title">Bill To:</div>
              <div class="customer-name">${customer.name || "Unknown Customer"}</div>
              <div style="font-size:9px"><span style="color:#555">Contact No:</span> ${customer.mobileNumber || ""}</div>
              <div style="font-size:9px"><span style="color:#555">Village/City:</span> ${customer.village || ""}</div>
            </div>
            <div class="bill-to-row" style="width:280px;">
              <div class="bill-to-title">Booking Info:</div>
              <div style="font-size:9px; margin-top:3px;"><span style="color:#555">Booking Date &amp; Time:</span> <b>${bookingDateStr}</b></div>
              <div style="font-size:9px; margin-top:3px;"><span style="color:#555">Return Date &amp; Time:</span> <b>${returnDateStr}</b></div>
            </div>
          </div>
          
          <div class="row" style="display:block;">
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width:3%">#</th>
                  <th style="text-align:left; width:35%">Item name</th>
                  <th style="width:10%">Belt</th>
                  <th style="width:15%">Fresh Piece</th>
                  <th style="width:7%">Quantity</th>
                  <th style="text-align:right; width:15%">Price(₹)</th>
                  <th style="text-align:right; width:15%">Amount(₹)</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
                <tr class="total-row">
                  <td></td>
                  <td style="text-align:left">Total</td>
                  <td></td>
                  <td></td>
                  <td>${totalQty}</td>
                  <td></td>
                  <td style="text-align:right">₹ ${grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div class="row summary-row">
            <div class="summary-col">
              <span style="color:#555">Sub Total:</span> ₹ ${subTotal.toFixed(2)}
            </div>
            <div class="summary-col" style="flex:2">
              <span style="color:#555">Total:</span> <b>₹ ${grandTotal.toFixed(2)}</b> (${this.numberToWords(grandTotal)})
            </div>
          </div>
          
          <div class="row summary-row">
            <div class="summary-col">
              <span style="color:#555">Advance Payment:</span> ₹ ${advancePayment.toFixed(2)}
            </div>
            <div class="summary-col">
              <span style="color:#555">Remaining Payment:</span> ₹ ${remainingPayment.toFixed(2)}
            </div>
          </div>
          
          <div class="row footer-row">
            <div class="footer-col-left" style="font-size: 8.5px;">
              <div style="font-weight:bold; margin-bottom:4px; color:#333; font-size: 9px;">Terms & Conditions:</div>
              <div style="color:#555; line-height: 1.4; padding-right: 12px;">
                1. એકવાર ઓર્ડર બુક થયા બાદ તે રદ (Cancel) કરી શકાશે નહીં. જો કોઈ કારણસર ઓર્ડર રદ કરવામાં આવશે, તો એડવાન્સમાં ચૂકવેલ રકમ પરત આપવામાં આવશે નહીં.<br>
                2. ચોળી પરત આપતી વખતે તેમાં તેલ, હળદર અથવા અન્ય કોઈપણ ડાઘ જોવા મળશે તો તેની સફાઈ માટે વધારાના ચાર્જ લેવામાં આવશે.<br>
                3. ચોળી ફાટેલી, નુકસાનગ્રસ્ત (Damage) અથવા કોઈપણ પ્રકારની ખરાબ સ્થિતિમાં પરત કરવામાં આવશે તો તેના માટે વધારાના ચાર્જ લેવામાં આવશે.<br>
                4. ચોળી નક્કી કરેલા સમય અથવા તારીખે પરત આપવામાં નહીં આવે તો મોડું પરત કરવા બદલ વધારાના ચાર્જ લેવામાં આવશે.<br>
                <b style="color:#333; display:inline-block; margin-top:2px;">ઉપરોક્ત તમામ નિયમો અને શરતો ગ્રાહકને માન્ય રહેશે.</b>
              </div>
            </div>
            <div class="footer-col-right">
              <div style="font-weight:bold; color:#333;">For PAVITRA CREATION:</div>
              <div style="text-align:center; color:#555; margin-top:auto;">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
