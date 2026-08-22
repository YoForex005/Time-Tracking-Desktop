import { useState, useEffect } from 'react';
import { getHolidays, type HolidayItem } from '../../api';

interface CalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenWebCalendar?: () => void;
}

export default function CalendarModal({ isOpen, onClose, onOpenWebCalendar }: CalendarModalProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState<HolidayItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        setLoading(true);

        getHolidays(year)
            .then(data => {
                if (isMounted && data?.holidays) {
                    setHolidays(data.holidays);
                }
            })
            .catch(err => {
                console.error('[CalendarModal] Failed to load holidays:', err);
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isOpen, year]);


    if (!isOpen) return null;

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sun, 1 is Mon...
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    // Monday-first indexing: 0 = Mon, 6 = Sun
    const startOffset = (firstDayOfMonth + 6) % 7;

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const todayDate = today.getDate();

    // Map holiday date string YYYY-MM-DD
    const holidayMap = new Map<string, HolidayItem>();
    for (const h of holidays) {
        if (h.isHoliday) {
            const dKey = h.date.split('T')[0];
            holidayMap.set(dKey, h);
        }
    }

    const prevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const calendarCells = [];

    // Prev month padding
    for (let i = startOffset - 1; i >= 0; i--) {
        calendarCells.push({
            dayNum: prevMonthDays - i,
            isCurrentMonth: false,
            isToday: false,
            isSunday: false,
            holiday: null,
            dateKey: '',
        });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayOfWeek = (startOffset + day - 1) % 7;
        const isSunday = dayOfWeek === 6;
        const isToday = isCurrentMonth && day === todayDate;
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`;
        const holiday = holidayMap.get(dateKey) || null;

        calendarCells.push({
            dayNum: day,
            isCurrentMonth: true,
            isToday,
            isSunday,
            holiday,
            dateKey,
        });
    }

    // Remaining cells to fill grid (up to multiple of 7)
    const remaining = (7 - (calendarCells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        calendarCells.push({
            dayNum: i,
            isCurrentMonth: false,
            isToday: false,
            isSunday: false,
            holiday: null,
            dateKey: '',
        });
    }

    return (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', zIndex: 1100 }}>
            <div className="modal calendar-modal-container">
                {/* Header */}
                <div className="modal-header-row">
                    <div className="modal-title-wrap">
                        <h2 className="modal-heading">Work Calendar</h2>
                        <span className="modal-subheading">Holidays, Shifts & Offs</span>
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="calendar-modal-body">
                    {/* Month Navigator */}
                    <div className="calendar-nav-bar">
                        <button className="btn-month-nav" onClick={prevMonth}>‹</button>
                        <strong className="calendar-current-month">
                            {monthNames[month]} {year} {loading && <span style={{ fontSize: 10, opacity: 0.6 }}>...</span>}
                        </strong>
                        <button className="btn-month-nav" onClick={nextMonth}>›</button>
                    </div>


                    {/* Weekday labels (Mon - Sun) */}
                    <div className="calendar-weekdays-row">
                        <span>Mo</span>
                        <span>Tu</span>
                        <span>We</span>
                        <span>Th</span>
                        <span>Fr</span>
                        <span>Sa</span>
                        <span className="text-sun">Su</span>
                    </div>

                    {/* Calendar Day Grid */}
                    <div className="calendar-days-grid">
                        {calendarCells.map((cell, idx) => (
                            <div
                                key={idx}
                                className={`cal-cell ${!cell.isCurrentMonth ? 'cal-cell-muted' : ''} ${cell.isToday ? 'cal-cell-today' : ''} ${cell.isSunday ? 'cal-cell-sun' : ''} ${cell.holiday ? 'cal-cell-holiday' : ''}`}
                                title={cell.holiday ? `Holiday: ${cell.holiday.name}` : cell.isSunday ? 'Sunday Weekly Off' : cell.isToday ? 'Today' : ''}
                            >
                                <span className="cal-day-num">{cell.dayNum}</span>
                                {cell.holiday && (
                                    <span className="cal-holiday-dot" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="calendar-legend-bar">
                        <div className="legend-item"><span className="legend-dot today-dot" /> Today</div>
                        <div className="legend-item"><span className="legend-dot holiday-dot" /> Holiday</div>
                        <div className="legend-item"><span className="legend-dot sun-dot" /> Sunday Off</div>
                    </div>
                </div>

                {/* Footer */}
                <div className="modal-footer-row">
                    <button
                        className="btn-modal-link"
                        onClick={() => {
                            onClose();
                            onOpenWebCalendar?.();
                        }}
                    >
                        View Holiday Calendar ↗
                    </button>

                    <button className="btn-modal-close" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
