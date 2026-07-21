import {useEffect, useState, useCallback, useRef} from 'react';

type PollingResult<T> = {
    data: T | null;
    error: Error | null;
    loading: boolean;
    refresh: () => void;
};

export function usePolling<T>(fn: () => Promise<T>, intervalMs: number): PollingResult<T> {

    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick((t) => t + 1), []);
    const fnRef = useRef(fn);

    fnRef.current = fn;

    usePoller(() => fnRef.current(), intervalMs, tick, setData, setError, setLoading);

    return {data, error, loading, refresh};

}

function usePoller<T>(
    fn: () => Promise<T>,
    intervalMs: number,
    tick: number,
    setData: (data: T) => void,
    setError: (error: Error | null) => void,
    setLoading: (loading: boolean) => void,
): void {

    useEffect((): (() => void) => {

        let cancelled = false;

        const load = async (): Promise<void> => {

            setLoading(true);

            try {

                const result = await fn();

                if (!cancelled) {

                    setData(result);
                    setError(null);

}

            } catch (err) {

                if (!cancelled) {

                    setError(err instanceof Error ? err : new Error(String(err)));

}

            } finally {

                if (!cancelled) {

                    setLoading(false);

}

}

};

        load();

        const id = setInterval(load, intervalMs);

        return (): void => {

            cancelled = true;
            clearInterval(id);

};

    }, [intervalMs, tick, setData, setError, setLoading]);

}
