interface TitlebarProps {
    userName: string;
}

export default function Titlebar({ userName }: TitlebarProps) {
    const handleClose = () => (window as unknown as { electronAPI?: { close: () => void } }).electronAPI?.close();
    const handleMin = () => (window as unknown as { electronAPI?: { minimize: () => void } }).electronAPI?.minimize();
    const handleMax = () => (window as unknown as { electronAPI?: { maximize: () => void } }).electronAPI?.maximize();

    return (
        <div className="titlebar">
            <div className="titlebar__logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
                Workfolio — {userName}
            </div>
            <div className="titlebar__controls">
                <button className="titlebar__btn titlebar__btn--close" title="Close" onClick={handleClose} />
                <button className="titlebar__btn titlebar__btn--min" title="Minimize" onClick={handleMin} />
                <button className="titlebar__btn titlebar__btn--max" title="Maximize" onClick={handleMax} />
            </div>
        </div>
    );
}
