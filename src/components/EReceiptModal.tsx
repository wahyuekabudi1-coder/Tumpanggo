/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Official E-Receipt (Electronic Payment Proof) Component
 * Renders verified payment receipt and provides client-side PDF download & sharing.
 */

import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { 
  X, Download, Share2, CheckCircle2, ShieldCheck, 
  Store, User, Calendar, Receipt, Hash, ArrowDownToLine, RefreshCw
} from 'lucide-react';
import { Order } from '../types';

interface EReceiptModalProps {
  order: Order;
  onClose: () => void;
}

export default function EReceiptModal({ order, onClose }: EReceiptModalProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const canonicalOrderCode = order.orderNumber || order.id;
  const cleanCode = canonicalOrderCode.replace(/^ord_/, '').replace(/^TF-/, '').toUpperCase();
  const receiptNumber = order.receiptNumber || order.receipt?.receiptNumber || `TG-RCP-${cleanCode}`;
  const verificationTime = order.paymentVerifiedAt || order.receipt?.issuedAt || order.updatedAt || order.createdAt;
  const verifiedDate = new Date(verificationTime);
  const formattedDate = !isNaN(verifiedDate.getTime()) 
    ? verifiedDate.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' WIB'
    : '21 Oktober 2026';

  const transactionRef = order.receipt?.transactionRef || order.artopayPaymentId || `QRIS-TG-${cleanCode}`;
  const verifiedBy = order.receipt?.confirmedBy || order.paymentVerifiedBy || 'Admin TumpangGo';
  const paymentMethodLabel = order.paymentMethod === 'ARTOPAY_QRIS' 
    ? 'QRIS Dinamis ArtoPay' 
    : 'QRIS Statis Resmi Merchant';

  // Format currency helper
  const formatRp = (val: number) => `Rp ${(val || 0).toLocaleString('id-ID')}`;

  // Generate and Download PDF using jsPDF
  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 18;

      // Header Banner Background
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(12, 10, pageWidth - 24, 38, 3, 3, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(12, 10, pageWidth - 24, 38, 3, 3, 'S');

      // Attempt to load and embed official /logo44.png with exact aspect ratio
      let logoEmbedded = false;
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/logo44.png';
        await new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve(true);
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 1500);
        });

        if (img.naturalWidth && img.naturalHeight) {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const base64Data = canvas.toDataURL('image/png');
            const logoH = 13; // 13mm height
            const logoW = logoH * (img.naturalWidth / img.naturalHeight); // ~26.9mm width preserving 1438x694
            doc.addImage(base64Data, 'PNG', 16, 14, logoW, logoH);
            logoEmbedded = true;
          }
        }
      } catch (e) {
        console.warn('Could not embed logo image in PDF, using text fallback:', e);
      }

      // Brand Title & Description
      const textStartX = logoEmbedded ? 47 : 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(220, 38, 38); // TumpangGo Red
      doc.text('TumpangGo', textStartX, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Platform Digital Kuliner & Niaga Lokal Kecamatan Tumpang, Malang', textStartX, y + 4.5);
      doc.text('Website Resmi: https://tumpanggo.vercel.app', textStartX, y + 8.5);

      // Receipt Title & Badge on Right
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('E-RECEIPT RESMI', pageWidth - 18, y, { align: 'right' });

      doc.setFillColor(220, 252, 231);
      doc.roundedRect(pageWidth - 58, y + 3, 40, 7, 1.5, 1.5, 'F');
      doc.setFontSize(8);
      doc.setTextColor(22, 101, 52);
      doc.text('LUNAS / VERIFIED', pageWidth - 38, y + 7.5, { align: 'center' });

      y = 54;

      // Metadata Grid Box
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(12, y, pageWidth - 24, 36, 2, 2, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('NO. RECEIPT:', 16, y + 7);
      doc.text('NO. PESANAN:', 16, y + 14);
      doc.text('TANGGAL BAYAR:', 16, y + 21);
      doc.text('METODE BAYAR:', 16, y + 28);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(receiptNumber, 52, y + 7);
      doc.text(`#${canonicalOrderCode}`, 52, y + 14);
      doc.setFont('helvetica', 'normal');
      doc.text(formattedDate, 52, y + 21);
      doc.text(paymentMethodLabel, 52, y + 28);

      // Column 2
      const col2X = 110;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('PEMESAN:', col2X, y + 7);
      doc.text('MERCHANT / TOKO:', col2X, y + 14);
      doc.text('REF. TRANSAKSI:', col2X, y + 21);
      doc.text('VERIFIKASI:', col2X, y + 28);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(order.customerName, col2X + 34, y + 7);
      doc.text(order.merchantName, col2X + 34, y + 14);
      doc.text(transactionRef, col2X + 34, y + 21);
      doc.text(`${verifiedBy} (Valid)`, col2X + 34, y + 28);

      y += 44;

      // Table Header: Order Items
      doc.setFillColor(241, 245, 249);
      doc.rect(12, y, pageWidth - 24, 7, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.line(12, y + 7, pageWidth - 12, y + 7);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text('Menu / Produk Makanan', 16, y + 5);
      doc.text('Qty', 115, y + 5, { align: 'center' });
      doc.text('Harga Satuan', 145, y + 5, { align: 'right' });
      doc.text('Jumlah', pageWidth - 16, y + 5, { align: 'right' });

      y += 11;

      // Items Row
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);

      const items = order.items && order.items.length > 0 
        ? order.items 
        : [{ menuItemId: 'item1', name: 'Pesanan Kuliner', price: order.subtotal, quantity: 1 }];

      for (const item of items) {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        doc.text(item.name.substring(0, 48), 16, y);
        doc.text(String(item.quantity || 1), 115, y, { align: 'center' });
        doc.text(formatRp(item.price), 145, y, { align: 'right' });
        doc.text(formatRp(itemTotal), pageWidth - 16, y, { align: 'right' });
        y += 6;
      }

      // Divider line
      y += 2;
      doc.setDrawColor(226, 232, 240);
      doc.line(12, y, pageWidth - 12, y);
      y += 6;

      // Financial Calculation Breakdown
      const rightValX = pageWidth - 16;
      const rightLabelX = 135;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Subtotal Makanan:', rightLabelX, y);
      doc.text(formatRp(order.subtotal), rightValX, y, { align: 'right' });
      y += 5.5;

      doc.text('Ongkos Kirim (Flat Kec. Tumpang):', rightLabelX, y);
      doc.text(formatRp(order.deliveryFee), rightValX, y, { align: 'right' });
      y += 5.5;

      doc.text('Biaya Layanan Sistem:', rightLabelX, y);
      doc.text(formatRp(order.serviceFee), rightValX, y, { align: 'right' });
      y += 5.5;

      if (order.uniqueCode && order.uniqueCode > 0) {
        doc.text('Kode Unik Verifikasi QRIS:', rightLabelX, y);
        doc.text(`+${order.uniqueCode}`, rightValX, y, { align: 'right' });
        y += 5.5;
      }

      // Grand Total Box
      y += 2;
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(120, y, pageWidth - 132, 10, 1.5, 1.5, 'F');
      doc.setDrawColor(254, 202, 202);
      doc.roundedRect(120, y, pageWidth - 132, 10, 1.5, 1.5, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(185, 28, 28);
      doc.text('TOTAL PEMBAYARAN:', 125, y + 6.5);
      doc.text(formatRp(order.total), rightValX, y + 6.5, { align: 'right' });

      y += 18;

      // Delivery Destination details
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(12, y, pageWidth - 24, 16, 2, 2, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(12, y, pageWidth - 24, 16, 2, 2, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('ALAMAT PENGANTARAN:', 16, y + 5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const deliveryText = `${order.deliveryAddress}${order.deliveryDetails ? ` (${order.deliveryDetails})` : ''}`;
      doc.text(deliveryText.substring(0, 95), 16, y + 10.5);

      y += 23;

      // Verification Footer Note & Digital Seal
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(12, y, pageWidth - 24, 18, 2, 2, 'F');
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(12, y, pageWidth - 24, 18, 2, 2, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(22, 101, 52);
      doc.text('BUKTI PEMBAYARAN DIGITAL SAH', 16, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(21, 128, 61);
      doc.text(
        'E-Receipt ini diterbitkan secara otomatis dan sah oleh sistem server TumpangGo setelah bukti transaksi diverifikasi oleh Admin. Dokumen digital ini diakui sebagai bukti lunas tanpa memerlukan stempel fisik.',
        16,
        y + 11,
        { maxWidth: pageWidth - 32 }
      );

      // Save PDF file
      const safeId = canonicalOrderCode.replace(/^ord_/, '').toUpperCase();
      const filename = `E-Receipt-TG-${safeId}.pdf`;
      doc.save(filename);
      setPdfError(null);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      setPdfError('Gagal membuat file PDF E-Receipt. Silakan coba kembali.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Native share or WhatsApp fallback
  const handleShare = async () => {
    const summaryText = 
      `*E-RECEIPT PEMBAYARAN TUMPANGGO*\n` +
      `No. Receipt: ${receiptNumber}\n` +
      `No. Pesanan: #${canonicalOrderCode}\n` +
      `Toko: ${order.merchantName}\n` +
      `Pemesan: ${order.customerName}\n` +
      `Total Lunas: ${formatRp(order.total)}\n` +
      `Metode: ${paymentMethodLabel}\n` +
      `Waktu: ${formattedDate}\n` +
      `Status: LUNAS (TERVERIFIKASI)\n\n` +
      `Diterbitkan resmi oleh sistem TumpangGo.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `E-Receipt TumpangGo #${canonicalOrderCode}`,
          text: summaryText
        });
        setShareFeedback('Berhasil membagikan receipt!');
        setTimeout(() => setShareFeedback(null), 3000);
        return;
      } catch {
        // Fallback to WhatsApp link if share is dismissed or unsupported
      }
    }

    // Direct WhatsApp pre-filled message (100% Free, user chooses recipient)
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summaryText);
      }
    } catch {
      // ignore clipboard error
    }

    const waUrl = `https://wa.me/?text=${encodeURIComponent(summaryText)}`;
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShareFeedback('Teks receipt disalin & tautan WhatsApp dibuka!');
    setTimeout(() => setShareFeedback(null), 3000);
  };

  return (
    <div 
      className="fixed inset-0 z-[130] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="relative max-w-xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden my-auto border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Receipt Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white p-5 sm:p-6 relative">
          <button 
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white p-1.5 flex items-center justify-center shrink-0 shadow-md">
              <img 
                src="/logo44.png" 
                alt="Logo TumpangGo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/logo44.png';
                }}
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 uppercase tracking-wider mb-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Pembayaran LUNAS Terverifikasi</span>
              </div>
              <h2 className="font-display font-extrabold text-lg sm:text-xl text-white tracking-tight">
                E-Receipt Pembayaran
              </h2>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Bukti transaksi resmi platform TumpangGo Malang
              </p>
            </div>
          </div>
        </div>

        {/* Receipt Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Key Identifiers Grid */}
          <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">No. Receipt</span>
              <span className="font-mono font-extrabold text-slate-900 text-xs sm:text-sm mt-0.5 block">
                {receiptNumber}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nomor Pesanan</span>
              <span className="font-mono font-extrabold text-rose-700 text-xs sm:text-sm mt-0.5 block">
                #{canonicalOrderCode}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Waktu Bayar</span>
              <span className="font-medium text-slate-700 text-[11px] mt-0.5 block">
                {formattedDate}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Metode Pembayaran</span>
              <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block">
                {paymentMethodLabel}
              </span>
            </div>
          </div>

          {/* Parties Info: Customer & Merchant */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <User className="w-3 h-3 text-slate-400" />
                Data Pelanggan
              </span>
              <p className="font-bold text-slate-900 text-xs">{order.customerName}</p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {order.customerPhone ? `${order.customerPhone.substring(0, 4)}****${order.customerPhone.slice(-3)}` : '-'}
              </p>
              <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                {order.deliveryAddress}
              </p>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Store className="w-3 h-3 text-rose-500" />
                Merchant / Toko
              </span>
              <p className="font-bold text-slate-900 text-xs">{order.merchantName}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Kecamatan Tumpang, Kab. Malang</p>
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>Terverifikasi: {verifiedBy}</span>
              </div>
            </div>
          </div>

          {/* Itemized Order Breakdown */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 flex justify-between text-[11px] font-bold text-slate-700">
              <span>Rincian Makanan</span>
              <span>Harga</span>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {(order.items && order.items.length > 0 ? order.items : [{ menuItemId: '1', name: 'Pesanan Kuliner', price: order.subtotal, quantity: 1 }]).map((it, idx) => (
                <div key={idx} className="p-3 flex justify-between items-center hover:bg-slate-50/50">
                  <div className="pr-2">
                    <p className="font-semibold text-slate-900">{it.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {it.quantity}x @ {formatRp(it.price)}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-slate-800 shrink-0">
                    {formatRp((it.price || 0) * (it.quantity || 1))}
                  </span>
                </div>
              ))}
            </div>

            {/* Price Calculations */}
            <div className="p-3.5 bg-slate-50/80 border-t border-slate-200 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal Makanan</span>
                <span className="font-mono font-medium">{formatRp(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <div>
                  <span>Ongkos Kirim</span>
                  <span className="text-[10px] text-emerald-600 font-bold ml-1.5">(Flat Kec. Tumpang)</span>
                </div>
                <span className="font-mono font-medium">{formatRp(order.deliveryFee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Biaya Layanan Sistem</span>
                <span className="font-mono font-medium">{formatRp(order.serviceFee)}</span>
              </div>
              {order.uniqueCode > 0 && (
                <div className="flex justify-between text-rose-700 font-medium">
                  <span>Kode Unik Verifikasi QRIS</span>
                  <span className="font-mono">+{order.uniqueCode}</span>
                </div>
              )}

              <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm font-extrabold text-slate-900">
                <span>TOTAL AKHIR LUNAS</span>
                <span className="text-base sm:text-lg font-mono text-emerald-700 font-black">
                  {formatRp(order.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Trust Seal Banner */}
          <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-950">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-[11px] leading-relaxed">
              <span className="font-bold text-emerald-900 block">Diterbitkan Resmi oleh Sistem TumpangGo</span>
              <p className="text-emerald-800">
                E-Receipt ini merupakan bukti pembayaran elektronik yang sah dan terverifikasi di server TumpangGo. Anda dapat mengunduh atau menyimpannya kapan saja.
              </p>
            </div>
          </div>

          {shareFeedback && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-center text-xs text-blue-800 font-medium animate-in fade-in">
              {shareFeedback}
            </div>
          )}

          {pdfError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-center text-xs text-rose-800 font-medium animate-in fade-in">
              {pdfError}
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="w-full sm:flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            {isGeneratingPdf ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Menyiapkan PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Unduh PDF E-Receipt</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="w-full sm:w-auto py-3 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-slate-500" />
            <span>Bagikan</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto py-3 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
