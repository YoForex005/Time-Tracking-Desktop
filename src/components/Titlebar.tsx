interface TitlebarProps {
    userName: string;
}

export default function Titlebar({ userName }: TitlebarProps) {
    const eAPI = () => (window as unknown as { electronAPI?: Record<string, () => void> }).electronAPI;
    const handleClose = () => eAPI()?.close();
    const handleMin = () => eAPI()?.minimize();
    const handleMax = () => eAPI()?.maximize();

    return (
        <div className="titlebar">
            <div className="titlebar__logo">
                <span className="titlebar__brand">YO HRMX</span>
                <span className="titlebar__user-label">— {userName}</span>
            </div>

            <div className="titlebar__right">
                <div className="titlebar__controls">
                    <button className="titlebar__btn titlebar__btn--close" title="Close" onClick={handleClose} />
                    <button className="titlebar__btn titlebar__btn--min" title="Minimize" onClick={handleMin} />
                    <button className="titlebar__btn titlebar__btn--max" title="Maximize" onClick={handleMax} />
                </div>
            </div>
        </div>
    );
}
