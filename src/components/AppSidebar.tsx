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
import { Sora } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";

const wordmark = Sora({ subsets: ["latin"], weight: ["600"], display: "swap" });

const NAV: { label: string; icon: typeof Users; href?: string }[] = [
	{ label: "My patients", icon: Users, href: "/" },
	{ label: "Modelization", icon: Box, href: "/modelization" },
	{ label: "Appointments", icon: CalendarDays },
	{ label: "Treatment follow-up", icon: Activity },
	{ label: "Reports", icon: FileText },
	{ label: "Messages", icon: MessageSquare },
	{ label: "Invoices", icon: Receipt },
];

/** Neuron-like node with a pulse wave running through it. No box. */
function Logo() {
	return (
		<svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
			<circle
				cx="16"
				cy="16"
				r="13"
				stroke="#2563eb"
				strokeWidth="2"
				strokeDasharray="62 20"
				strokeLinecap="round"
				transform="rotate(-70 16 16)"
			/>
			<path
				d="M3 17h6l3-8 4.5 14 3.5-9 2 3h7"
				stroke="#2563eb"
				strokeWidth="2.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function AppSidebar() {
	const path = usePathname();
	return (
		<aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
			<Link
				href="/"
				aria-label="NeuroPulse home"
				className="flex items-center gap-2.5 px-6 py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
			>
				<Logo />
				<span
					className={`${wordmark.className} text-[19px] tracking-tight text-blue-600`}
				>
					NeuroPulse
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
					const inner = (
						<>
							<Icon className="h-[18px] w-[18px]" />
							{label}
						</>
					);
					return href ? (
						<Link
							key={label}
							href={href}
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
