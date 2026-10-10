export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-sunken py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } }`}</style>
      {children}
    </div>
  );
}
