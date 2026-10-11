import { IBackspace } from './Icons';

/**
 * A calculator-style keypad for rupees: bigger and faster than the phone
 * keyboard, and it cannot produce anything that is not an amount.
 */
export function Keypad({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const press = (k: string) => {
    if (k === 'del') return onChange(value.slice(0, -1));
    if (k === 'clear') return onChange('');
    const next = (value === '0' ? '' : value) + k;
    if (next.replace(/^0+/, '').length > 9) return;       // up to ₹99,99,99,999
    onChange(next.replace(/^0+(?=\d)/, ''));
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
  return (
    <div className="keypad" role="group" aria-label={label}>
      {keys.map(k => (
        <button key={k} type="button" onClick={() => press(k)} onContextMenu={e => { if (k === 'del') { e.preventDefault(); press('clear'); } }}
          aria-label={k === 'del' ? 'backspace' : k}>
          {k === 'del' ? <IBackspace /> : k}
        </button>
      ))}
    </div>
  );
}
