import {useEffect, useState} from 'react';

export type Theme = 'light' | 'dark' | 'system';

function resolveTheme(theme: Theme): 'light' | 'dark' {

    if (theme !== 'system') {

        return theme;

}
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

}

export function useTheme(): {theme: Theme; setTheme: (theme: Theme) => void} {

    const [theme, setTheme] = useState<Theme>(() => {

        if (typeof window === 'undefined') {

            return 'system';

}
        return (localStorage.getItem('castellan-theme') as Theme) || 'system';

});

    useEffect(() => {

        document.documentElement.setAttribute('data-theme', resolveTheme(theme));
        localStorage.setItem('castellan-theme', theme);

}, [theme]);

    useEffect(() => {

        if (theme !== 'system') {

            return undefined;

}
        const listener = (event: MediaQueryListEvent): void => {

            document.documentElement.setAttribute('data-theme', event.matches ? 'light' : 'dark');

};
        const media = window.matchMedia('(prefers-color-scheme: light)');

        media.addEventListener('change', listener);
        return (): void => {

            media.removeEventListener('change', listener);

};

}, [theme]);

    return {theme, setTheme};

}
