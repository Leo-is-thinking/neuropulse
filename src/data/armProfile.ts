// Forearm and hand proportions for the 3D replay model. Lengths in centimetres.
//
// ARMELLE: measured on 9 local photos (palm, back of hand, forearm, both arms relaxed), using the 2.5 cm
// fabric wristband in the frame as the scale. Ratios read on the flat-hand photos: hand length / wrist width ≈ 3.2,
// palm breadth / hand length ≈ 0.44, middle finger / hand length ≈ 0.45. Slender build, long thin fingers,
// fair skin with a pink undertone (sampled on palm and inner forearm, white balance corrected).
// Photos stay on this machine; only these numbers are used.

export interface ArmProfile {
	id: string;
	label: string;
	/** Elbow crease to wrist crease. */
	forearmLength: number;
	/** Forearm width / thickness at the muscle belly (about 1/4 down from the elbow). */
	bellyWidth: number;
	bellyThickness: number;
	/** Width / thickness at the wrist crease. */
	wristWidth: number;
	wristThickness: number;
	/** Wrist crease to middle fingertip. */
	handLength: number;
	/** Palm breadth across the knuckles (2nd to 5th). */
	palmBreadth: number;
	/** Wrist crease to the middle knuckle. */
	palmLength: number;
	/** Finger lengths, knuckle to tip: index, middle, ring, little, then thumb (from its base joint). */
	fingers: [number, number, number, number, number];
	/** Finger thickness at the base. */
	fingerWidth: number;
	skin: string;
	palm: string;
	nail: string;
	/** Whole body, for the low-detail mannequin around the forearm. */
	height: number;
	upperArmLength: number;
	shoulderWidth: number;
	/** Reference photos the proportions come from (served by /api/patient-photos, never from public/). */
	photos?: { patientId: string; items: { file: string; used: string }[] };
}

export const ARMELLE: ArmProfile = {
	id: "armelle",
	label: "Armelle (from photos)",
	forearmLength: 24.5,
	bellyWidth: 7.4,
	bellyThickness: 6.2,
	wristWidth: 5.4,
	wristThickness: 3.8,
	handLength: 17.6,
	palmBreadth: 7.7,
	palmLength: 9.8,
	fingers: [7.2, 7.9, 7.4, 5.9, 6.2],
	fingerWidth: 1.65,
	skin: "#e9c6b5",
	palm: "#e8b4ab",
	nail: "#f1d3cc",
	height: 163,
	upperArmLength: 29.5,
	shoulderWidth: 35,
	photos: {
		patientId: "armel",
		items: [
			{ file: "armelle-01.jpg", used: "Palm breadth 7.7 cm, finger lengths" },
			{
				file: "armelle-02.jpg",
				used: "Forearm length 24.5 cm, wrist width 5.4 cm (2.5 cm wristband as scale)",
			},
			{
				file: "armelle-03.jpg",
				used: "Hand length 17.6 cm, palm length 9.8 cm",
			},
			{
				file: "armelle-04.jpg",
				used: "Skin tone, wrist crease, forearm taper",
			},
			{ file: "armelle-05.jpg", used: "Relaxed finger curl, both arms" },
			{
				file: "armelle-06.jpg",
				used: "Arms hanging: upper arm 29.5 cm, shoulder width 35 cm",
			},
			{ file: "armelle-07.jpg", used: "Resting hand posture, palm up" },
			{ file: "armelle-08.jpg", used: "Forearm belly width 7.4 cm" },
			{ file: "armelle-09.jpg", used: "Thumb position at rest" },
		],
	},
};

export const GENERIC_ELDER: ArmProfile = {
	id: "generic",
	label: "Average adult",
	forearmLength: 26.5,
	bellyWidth: 8.6,
	bellyThickness: 7.2,
	wristWidth: 6.0,
	wristThickness: 4.2,
	handLength: 18.8,
	palmBreadth: 8.6,
	palmLength: 10.6,
	fingers: [7.4, 8.2, 7.7, 6.2, 6.4],
	fingerWidth: 1.9,
	skin: "#d9b29c",
	palm: "#dca69a",
	nail: "#e9c9bf",
	height: 170,
	upperArmLength: 31,
	shoulderWidth: 39,
};
