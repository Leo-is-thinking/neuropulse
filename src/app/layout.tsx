import "./globals.css";
import type { ReactNode } from "react";
import Splash from "../components/Splash";

export const metadata = { title: "99%" };

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<Splash />
				{children}
			</body>
		</html>
	);
}
