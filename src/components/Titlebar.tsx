import logoWide from '../assets/logo-wide.png';

export default function Titlebar() {
    const handleClose = () => {
        window.electronAPI?.close();
    };
    
    const handleMin = () => window.electronAPI?.minimize();

    return (
        <header className="titlebar">
            <div className="titlebar-left">
                <img
                    src={logoWide}
                    alt="YoForex"
                    className="titlebar-full-logo"
                />
            </div>

            <div className="titlebar__right">
                <div className="titlebar__controls">
                    <button className="titlebar__icon-btn" title="Minimize" onClick={handleMin} type="button">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 6H10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                    <button className="titlebar__icon-btn titlebar__icon-btn--close" title="Close" onClick={handleClose} type="button">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    );
}

