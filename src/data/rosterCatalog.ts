export interface RosterEntry {
	id: string;
	name: string;
	age?: number;
	condition: string;
	/** Only entries with a dataset open the cockpit. */
	live?: boolean;
}

export const ROSTER: RosterEntry[] = [
	{
		id: "henri-m",
		name: "Henri M.",
		age: 74,
		condition: "Parkinson's disease",
		live: true,
	},
	{
		id: "armel",
		name: "Armel",
		condition: "Parkinson's detection",
		live: true,
	},
	{
		id: "margaret-l",
		name: "Margaret L.",
		age: 68,
		condition: "Parkinson's disease",
	},
	{
		id: "robert-k",
		name: "Robert K.",
		age: 79,
		condition: "Parkinson's disease",
	},
	{ id: "yuki-t", name: "Yuki T.", age: 71, condition: "Alzheimer's disease" },
	{
		id: "eleanor-r",
		name: "Eleanor R.",
		age: 81,
		condition: "Alzheimer's disease",
	},
	{
		id: "samuel-b",
		name: "Samuel B.",
		age: 69,
		condition: "Alzheimer's disease",
	},
];
