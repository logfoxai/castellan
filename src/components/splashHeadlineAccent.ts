/** Headline fragment highlighted on the home hero (Castellan amber accent). */
export const SPLASH_ACCENT_PHRASE = 'Guard';

export function splitHeadlineForAccent(
	headline: string,
	phrase = SPLASH_ACCENT_PHRASE,
): {before: string; phrase: string; after: string} | null {
	const index = headline.indexOf(phrase);
	if (index === -1) return null;
	return {
		before: headline.slice(0, index),
		phrase,
		after: headline.slice(index + phrase.length),
	};
}
