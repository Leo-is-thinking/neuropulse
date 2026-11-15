"use client";
import {
	Activity,
	Box,
	CalendarDays,
	FileText,
	MessageSquare,
	Receipt,
	Settings,
	Users,
} from "lucide-react";
import { Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";

const wordmark = Space_Grotesk({
	subsets: ["latin"],
	weight: ["600"],
	display: "swap",
});

const NAV: { label: string; icon: typeof Users; href?: string }[] = [
	{ label: "My patients", icon: Users, href: "/" },
	{ label: "Modelization", icon: Box, href: "/modelization" },
	{ label: "Appointments", icon: CalendarDays },
	{ label: "Treatment follow-up", icon: Activity },
	{ label: "Reports", icon: FileText },
	{ label: "Messages", icon: MessageSquare },
	{ label: "Invoices", icon: Receipt },
];

const DOTS = Array.from({ length: 100 }, (_, i) => i);

/** 100 dots: 99 blue = the time we capture, 1 black = the visit the clinician sees today. */
function Logo() {
	return (
		<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
			{DOTS.map((i) => (
				<circle
					key={i}
					cx={1.5 + (i % 10) * 3}
					cy={1.5 + Math.floor(i / 10) * 3}
					r={1.15}
					fill={i === 9 ? "#0f172a" : "#2563eb"}
				/>
			))}
		</svg>
	);
}

export function AppSidebar() {
	const path = usePathname();
	return (
		<aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
			<Link
				href="/"
				aria-label="99% home"
				className="flex items-center gap-2.5 px-6 py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
			>
				<Logo />
				<span
					className={`${wordmark.className} text-[21px] leading-none tracking-[-0.04em] text-slate-900`}
				>
					ninety-nine<span className="text-blue-600">%</span>
				</span>
			</Link>

			<nav className="flex-1 space-y-1 px-3" aria-label="Main">
				{NAV.map(({ label, icon: Icon, href }) => {
					const active =
						href === "/modelization"
							? path.startsWith(href)
							: href === "/" && !path.startsWith("/modelization");
					const cls = `flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
						active
							? "bg-blue-50 text-blue-700"
							: "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
					}`;
					const to =
						href === "/modelization" && path.startsWith("/patient/armel")
							? "/modelization?patient=armel"
							: href;
					const inner = (
						<>
							<Icon className="h-[18px] w-[18px]" />
							{label}
						</>
					);
					return href ? (
						<Link
							key={label}
							href={to ?? "/"}
							aria-current={active ? "page" : undefined}
							className={cls}
						>
							{inner}
						</Link>
					) : (
						<button key={label} type="button" className={cls}>
							{inner}
						</button>
					);
				})}
			</nav>

			<div className="space-y-1 border-t border-slate-100 px-3 py-3">
				<button
					type="button"
					className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900"
				>
					<Settings className="h-[18px] w-[18px]" />
					Settings
				</button>
				<div className="flex items-center gap-3 px-3 py-2">
					<span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
						DL
					</span>
					<div className="leading-tight">
						<p className="text-sm font-medium text-slate-900">Dr. Laurent</p>
						<p className="text-xs text-slate-500">Neurology</p>
					</div>
				</div>
			</div>
		</aside>
	);
}
