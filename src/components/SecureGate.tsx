"use client";

import {
	ArrowLeft,
	Check,
	Delete,
	Loader2,
	Lock,
	ServerCog,
	ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import {
	type FormEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { AppSidebar } from "@/components/AppSidebar";

const STEPS = [
	"Verifying credentials",
	"Opening encrypted channel",
	"Decrypting patient record",
];

/** Demo gate: any 4-digit PIN (or Enter) unlocks. Re-asked on every patient record opened. */
export default function SecureGate({
	patientName,
	children,
}: {
	patientName: string;
	children: ReactNode;
}) {
	const [pin, setPin] = useState("");
	const [step, setStep] = useState(-1);
	const [open, setOpen] = useState(false);
	const started = useRef(false);

	const unlock = useCallback(() => {
		if (started.current) return;
		started.current = true;
		setStep(0);
		STEPS.forEach((_, i) => setTimeout(() => setStep(i + 1), (i + 1) * 450));
		setTimeout(() => setOpen(true), STEPS.length * 450 + 150);
	}, []);

	useEffect(() => {
		if (pin.length === 4) unlock();
	}, [pin, unlock]);

	const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));

	if (open) return <>{children}</>;

	const submit = (e: FormEvent) => {
		e.preventDefault();
		unlock();
	};
	const busy = step >= 0;

	return (
		<div className="flex min-h-screen bg-slate-50 text-slate-900">
			<AppSidebar />
			<main className="flex min-w-0 flex-1 items-center justify-center px-6 py-10">
				<div className="w-full max-w-md">
					<Link
						href="/"
						className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors duration-150 hover:text-slate-800"
					>
						<ArrowLeft className="h-4 w-4" /> My patients
					</Link>
					<form
						onSubmit={submit}
						className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
					>
						<span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
							<Lock className="h-5 w-5" aria-hidden />
						</span>
						<h1 className="mt-5 text-xl font-semibold tracking-tight">
							Secure access
						</h1>
						<p className="mt-1 text-sm text-slate-500">
							Protected health information. Enter your access code to open{" "}
							<span className="font-medium text-slate-700">{patientName}</span>
							&apos;s record.
						</p>

						<label
							htmlFor="pin"
							className="mt-6 block text-xs font-medium text-slate-600"
						>
							4-digit access code
						</label>
						<div className="relative mt-2">
							<input
								id="pin"
								type="password"
								inputMode="numeric"
								pattern="[0-9]*"
								maxLength={4}
								autoFocus
								autoComplete="off"
								disabled={busy}
								value={pin}
								onChange={(e) =>
									setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
								}
								aria-label="4-digit access code"
								className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
							/>
							<div className="flex justify-center gap-3" aria-hidden>
								{[0, 1, 2, 3].map((i) => (
									<span
										key={i}
										className={`flex h-14 w-12 items-center justify-center rounded-xl border text-2xl transition-colors duration-150 ${
											i === pin.length && !busy
												? "border-blue-600 ring-2 ring-blue-100"
												: "border-slate-200"
										} ${i < pin.length ? "bg-blue-50 text-blue-700" : "bg-white"}`}
									>
										{i < pin.length ? "•" : ""}
									</span>
								))}
							</div>
						</div>

						<div className="mx-auto mt-5 grid max-w-[15rem] grid-cols-3 gap-2">
							{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
								<button
									key={d}
									type="button"
									disabled={busy}
									onClick={() => press(d)}
									className="cursor-pointer rounded-lg bg-slate-50 py-2.5 text-base font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100 disabled:opacity-50"
								>
									{d}
								</button>
							))}
							<button
								type="button"
								disabled={busy}
								onClick={() => setPin((p) => p.slice(0, -1))}
								aria-label="Delete"
								className="cursor-pointer rounded-lg py-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
							>
								<Delete className="mx-auto h-4 w-4" />
							</button>
							<button
								type="button"
								disabled={busy}
								onClick={() => press("0")}
								className="cursor-pointer rounded-lg bg-slate-50 py-2.5 text-base font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100 disabled:opacity-50"
							>
								0
							</button>
							<button
								type="submit"
								disabled={busy}
								aria-label="Unlock"
								className="flex cursor-pointer items-center justify-center rounded-lg bg-blue-600 py-2.5 text-white transition-colors duration-150 hover:bg-blue-700 disabled:opacity-50"
							>
								{busy ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<ShieldCheck className="h-4 w-4" />
								)}
							</button>
						</div>

						{busy && (
							<ul className="mt-5 space-y-2 text-sm" aria-live="polite">
								{STEPS.map((label, i) => (
									<li
										key={label}
										className={`flex items-center gap-2 ${i <= step ? "text-slate-700" : "text-slate-300"}`}
									>
										{i < step ? (
											<Check className="h-4 w-4 text-emerald-600" />
										) : i === step ? (
											<Loader2 className="h-4 w-4 animate-spin text-blue-600" />
										) : (
											<span className="h-4 w-4" />
										)}
										{label}
									</li>
								))}
							</ul>
						)}

						<div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
							<ServerCog className="h-3.5 w-3.5 shrink-0" aria-hidden />
							AES-256 encrypted · Access logged · HIPAA / GDPR compliant
							infrastructure
						</div>
					</form>
				</div>
			</main>
		</div>
	);
}
