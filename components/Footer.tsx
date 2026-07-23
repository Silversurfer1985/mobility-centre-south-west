import Link from "next/link";

const quickLinks = [
  { href: "/about", label: "About Us" },
  { href: "/delivery-returns", label: "Delivery & Returns" },
  { href: "/faqs", label: "FAQs" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-conditions", label: "Terms & Conditions" },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-[#0B4F6C] text-white/80">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3 md:px-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Mobility Centre South West</h2>
          <p className="mt-3 text-sm leading-7 text-white/70">
            Professional supplier of mobility, care and healthcare products for
            domestic and trade customers across the UK.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Quick Links</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-white/70 hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Contact</h3>
          <p className="mt-3 text-sm text-white/70">Call us: 01208 75355</p>
          <p className="text-sm text-white/70">Email: sales@mobilitycentresouthwest.com</p>
          <p className="text-sm text-white/70">Coverage: Cornwall, Devon and South West England</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/40">
        Copyright {new Date().getFullYear()} Mobility Centre South West. All rights reserved.
      </div>
    </footer>
  );
}
