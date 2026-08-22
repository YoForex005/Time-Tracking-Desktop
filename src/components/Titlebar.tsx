import logoWide from '../assets/logo-wide.png';

const TITLEBAR_CONTROLS_STYLE = {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    WebkitAppRegion: 'no-drag',
} as const;

export default function Titlebar() {
    const handleClose = () => {
        // The app now hides to the system tray when closed, so tracking keeps
        // running silently in the background. No warning popup is needed.
        window.electronAPI?.close();
    };
    
    const handleMin = () => window.electronAPI?.minimize();

    return (
        <div className="titlebar">
            <div className="titlebar-left">
                <img
                    src={logoWide}
                    alt="YoForex"
                    className="titlebar-full-logo"
                />
            </div>


            <div className="titlebar__right">
                <div className="titlebar__controls" style={TITLEBAR_CONTROLS_STYLE}>
                    <button className="titlebar__icon-btn" title="Minimize" onClick={handleMin}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                    <button className="titlebar__icon-btn titlebar__icon-btn--close" title="Close" onClick={handleClose}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
