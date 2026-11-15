"use client";

import { useEffect, useState } from "react";

const KEY = "np-splash-seen";

export default function Splash() {
	const [open, setOpen] = useState(true);
	const [diving, setDiving] = useState(false);

	useEffect(() => {
		if (sessionStorage.getItem(KEY)) setOpen(false);
	}, []);

	if (!open) return null;

	const enter = () => {
		if (diving) return;
		setDiving(true);
		sessionStorage.setItem(KEY, "1");
		setTimeout(() => setOpen(false), 800);
	};

	return (
		<div
			className={`fixed inset-0 z-[9999] flex items-center justify-center bg-blue-600 transition-opacity duration-700 ease-in ${
				diving ? "pointer-events-none opacity-0" : "opacity-100"
			}`}
		>
			<button
				type="button"
				onClick={enter}
				aria-label="Enter"
				className={`cursor-pointer select-none text-[12rem] font-extrabold leading-none text-white outline-none transition-all duration-700 ease-in hover:scale-110 hover:drop-shadow-[0_0_40px_rgba(255,255,255,0.8)] active:scale-95 ${
					diving ? "scale-[40] blur-sm" : "scale-100"
				}`}
			>
				1%
			</button>
		</div>
	);
}
