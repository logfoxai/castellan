/** Parse a docker stats percentage string for UI gauge display. */
export function parseUsagePercent(value: string | undefined): number | null {

    if (!value || value === '—') {

        return null;

}

    const parsed = Number.parseFloat(value.replace('%', '').trim());

    return Number.isFinite(parsed) ? parsed : null;

}
