import {
    createContext,
    type CSSProperties,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

type OvertimePromptResult = 'yes' | 'no';

type OvertimePromptContextValue = {
    requestOvertimeConfirmation: (
        onDecision: (result: OvertimePromptResult) => Promise<boolean>
    ) => Promise<OvertimePromptResult>;
};

type PromptState = {
    resolve: (result: OvertimePromptResult) => void;
    onDecision: (result: OvertimePromptResult) => Promise<boolean>;
};

const OvertimePromptContext = createContext<OvertimePromptContextValue | null>(null);

const portalHostStyles: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 2147483647,
    pointerEvents: 'none',
};

const overlayStyles: CSSProperties = {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 2147483647,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
};

export function OvertimePromptProvider({ children }: { children: ReactNode }) {
    const [prompt, setPrompt] = useState<PromptState | null>(null);
    const [processingChoice, setProcessingChoice] = useState<OvertimePromptResult | null>(null);
    const [actionError, setActionError] = useState('');
    const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
    const promptRef = useRef<PromptState | null>(null);
    const pendingPromiseRef = useRef<Promise<OvertimePromptResult> | null>(null);
    const processingRef = useRef(false);
    const noButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (typeof document === 'undefined') return;

        let host = document.getElementById('overtime-modal-portal') as HTMLElement | null;
        if (!host) {
            host = document.createElement('div');
            host.id = 'overtime-modal-portal';
            document.body.appendChild(host);
        } else if (host.parentElement !== document.body) {
            document.body.appendChild(host);
        }

        Object.assign(host.style, portalHostStyles);
        setPortalHost(host);
    }, []);

    useEffect(() => {
        promptRef.current = prompt;
        if (!prompt) return;

        document.body.classList.add('overtime-modal-open');

        const focusTimer = window.setTimeout(() => {
            noButtonRef.current?.focus();
        }, 0);

        return () => {
            window.clearTimeout(focusTimer);
            document.body.classList.remove('overtime-modal-open');
        };
    }, [prompt]);

    useEffect(() => {
        if (!prompt) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [prompt]);

    const requestOvertimeConfirmation = useCallback((
        onDecision: (result: OvertimePromptResult) => Promise<boolean>
    ) => {
        if (pendingPromiseRef.current) return pendingPromiseRef.current;

        const promise = new Promise<OvertimePromptResult>((resolve) => {
            setActionError('');
            setProcessingChoice(null);
            processingRef.current = false;
            setPrompt({ resolve, onDecision });
        });
        pendingPromiseRef.current = promise;
        return promise;
    }, []);

    const resolvePrompt = useCallback(async (result: OvertimePromptResult) => {
        const activePrompt = promptRef.current;
        if (!activePrompt || processingRef.current) return;

        setActionError('');
        processingRef.current = true;
        setProcessingChoice(result);

        try {
            const completed = await activePrompt.onDecision(result);
            if (!completed) {
                setActionError('Could not save your choice. Please try again.');
                return;
            }

            pendingPromiseRef.current = null;
            promptRef.current = null;
            setPrompt(null);
            activePrompt.resolve(result);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Could not save your choice. Please try again.');
        } finally {
            processingRef.current = false;
            setProcessingChoice(null);
        }
    }, []);

    const modal = prompt && typeof document !== 'undefined'
        ? createPortal(
            <div
                className="overtime-modal-root"
                role="presentation"
                style={overlayStyles}
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                <div
                    className="overtime-modal"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="overtime-modal-title"
                >
                    <h2 id="overtime-modal-title">Do you want to start OverTime?</h2>
                    {actionError && (
                        <div className="overtime-modal__error" role="alert">
                            {actionError}
                        </div>
                    )}
                    <div className="overtime-modal__actions">
                        <button
                            ref={noButtonRef}
                            type="button"
                            className="overtime-modal__button overtime-modal__button--no"
                            disabled={processingChoice !== null}
                            onClick={() => resolvePrompt('no')}
                        >
                            {processingChoice === 'no' ? 'Saving...' : 'No'}
                        </button>
                        <button
                            type="button"
                            className="overtime-modal__button overtime-modal__button--yes"
                            disabled={processingChoice !== null}
                            onClick={() => resolvePrompt('yes')}
                        >
                            {processingChoice === 'yes' ? 'Saving...' : 'Yes'}
                        </button>
                    </div>
                </div>
            </div>,
            portalHost ?? document.body
        )
        : null;

    return (
        <OvertimePromptContext.Provider value={{ requestOvertimeConfirmation }}>
            {children}
            {modal}
        </OvertimePromptContext.Provider>
    );
}

export function useOvertimePrompt() {
    const context = useContext(OvertimePromptContext);
    if (!context) {
        throw new Error('useOvertimePrompt must be used within OvertimePromptProvider');
    }
    return context;
}
