interface TitlebarProps {
    userName: string;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}

const SunIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);

const MoonIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

export default function Titlebar({ userName, theme, onToggleTheme }: TitlebarProps) {
    const eAPI = () => (window as unknown as { electronAPI?: Record<string, () => void> }).electronAPI;
    const handleClose  = () => eAPI()?.close();
    const handleMin    = () => eAPI()?.minimize();
    const handleMax    = () => eAPI()?.maximize();

    return (
        <div className="titlebar">
            <div className="titlebar__logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                WorkFolio — {userName}
            </div>

            <div className="titlebar__right">
                <button
                    className="theme-toggle"
                    onClick={onToggleTheme}
                    title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                </button>

                <div className="titlebar__controls">
                    <button className="titlebar__btn titlebar__btn--close" title="Close"    onClick={handleClose} />
                    <button className="titlebar__btn titlebar__btn--min"   title="Minimize" onClick={handleMin}   />
                    <button className="titlebar__btn titlebar__btn--max"   title="Maximize" onClick={handleMax}   />
                </div>
            </div>
        </div>
    );
}
