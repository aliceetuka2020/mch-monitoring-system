import "./globals.css";

export const metadata = {
  title: "MCH Monitoring System, Karu PHC",
  description: "Web-based Maternal and Child Healthcare Monitoring System for Karu Primary Healthcare Centre",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
