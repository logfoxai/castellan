type UsageRingProps = {
    percent: number | null;
    tone?: 'cpu' | 'memory';
};

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function UsageRing({percent, tone = 'cpu'}: UsageRingProps): JSX.Element {

    const value = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
    const offset = CIRCUMFERENCE - (value / 100) * CIRCUMFERENCE;

    return (
        <span className={`usage-ring usage-ring-${tone}`} aria-hidden="true">
            <svg viewBox="0 0 20 20">
                <circle className="usage-ring-track" cx="10" cy="10" r={RADIUS} />
                <circle
                    className="usage-ring-fill"
                    cx="10"
                    cy="10"
                    r={RADIUS}
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={offset}
                />
            </svg>
        </span>
    );

}
