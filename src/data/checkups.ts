// Demo check-up history (levodopa decisions). Real source: clinic record, not the band.
export interface CheckupPoint {
	label: string;
	/** Total levodopa, mg per day. */
	mg: number;
}

export interface Medication {
	name: string;
	unit: string;
	doses: { time: string; mg: number }[];
	/** Oldest first, ending at the last check-up. */
	history: CheckupPoint[];
}

export interface CheckupInfo {
	/** Doctor's own free-text note written at the last check-up (demo seed). */
	doctorNotes?: string;
	/** What the doctor decided to monitor until the next check-up. */
	watchItems?: string[];
	profile: { label: string; value: string }[];
	/** Medications other than levodopa (levodopa comes from the live schedule). */
	otherMeds: Medication[];
	/** Days since the last check-up. */
	daysAgo: number;
	/** Short bullets, `**bold**` marks the key words. */
	bullets: { title: string; text: string }[];
	/** Oldest first, ending at the last check-up. */
	history: CheckupPoint[];
}

export const CHECKUPS: Record<string, CheckupInfo> = {
	"henri-m": {
		daysAgo: 7,
		doctorNotes:
			"Seen with his wife. Right-hand tremor comes back around 16:30, about 30 min before the 17:00 dose. Walks 20 min every morning, no falls this month. Slightly dizzy when standing up fast. Wants to avoid higher doses if possible because of the dyskinesia risk.\n\nPlan: 300 mg/day for 2 weeks, then decide on adding a small 4th dose at 20:00.",
		watchItems: [
			"Does the tremor still come back before the 17:00 dose?",
			"Dizziness on standing (blood pressure lying and standing)",
			"Any involuntary movements after the 300 mg dose",
			"Night wake-ups, falls and daily steps",
		],
		profile: [
			{ label: "Age", value: "74 years" },
			{ label: "Weight", value: "78 kg" },
			{ label: "Height", value: "175 cm" },
			{ label: "BMI", value: "25.5" },
			{ label: "Diagnosed", value: "2021 (5 years)" },
			{ label: "Other conditions", value: "Hypertension" },
			{ label: "Allergies", value: "None known" },
		],
		otherMeds: [
			{
				name: "Rasagiline",
				unit: "mg",
				doses: [{ time: "08:00", mg: 1 }],
				history: [
					{ label: "6 months ago", mg: 0 },
					{ label: "4 months ago", mg: 1 },
					{ label: "2 months ago", mg: 1 },
					{ label: "Last week|last check-up", mg: 1 },
				],
			},
		],
		bullets: [
			{
				title: "Context",
				text: "Tremor coming back **before the 17:00 dose** (wearing-off).",
			},
			{
				title: "Medication change",
				text: "Levodopa **raised from 250 to 300 mg/day** (3 × 100 mg).",
			},
			{
				title: "Next step",
				text: "**Re-check in 2 weeks** to confirm the tremor drops.",
			},
		],
		history: [
			{ label: "6 months ago", mg: 200 },
			{ label: "4 months ago", mg: 200 },
			{ label: "2 months ago", mg: 250 },
			{ label: "Last week|last check-up", mg: 300 },
		],
	},
};
