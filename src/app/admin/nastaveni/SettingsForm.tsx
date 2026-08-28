'use client';

import { useActionState } from 'react';
import { adminSaveSettingsAction, type AdminFormState } from '@/app/actions/admin';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: AdminFormState = {};

const DAYS = [
  { value: '1', label: 'Po' },
  { value: '2', label: 'Út' },
  { value: '3', label: 'St' },
  { value: '4', label: 'Čt' },
  { value: '5', label: 'Pá' },
  { value: '6', label: 'So' },
  { value: '7', label: 'Ne' },
];

type Props = {
  settings: {
    dayStart: string;
    dayEnd: string;
    slotMinutes: number;
    openDays: string[];
    maxAdvanceDays: number;
    weeklyTokens: number;
    maxPerDay: number;
    minDurationMinutes: number;
    allowOvernight: boolean;
    allowAllDay: boolean;
    pointsPerTokenLoss: number;
    blockAtPoints: number;
    penaltyDecayDays: number;
    noticeText: string;
  };
};

function NumberField({
  name,
  label,
  hint,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="field"
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function SettingsForm({ settings }: Props) {
  const [state, action] = useActionState(adminSaveSettingsAction, initial);

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}

      <div className="card card-pad">
        <h2 className="section-title mb-4">Provoz parkoviště</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="dayStart">
              Začátek provozní doby
            </label>
            <input
              id="dayStart"
              name="dayStart"
              type="time"
              defaultValue={settings.dayStart}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="dayEnd">
              Konec provozní doby
            </label>
            <input
              id="dayEnd"
              name="dayEnd"
              type="time"
              defaultValue={settings.dayEnd}
              className="field"
            />
          </div>
          <NumberField
            name="slotMinutes"
            label="Délka slotu (min.)"
            defaultValue={settings.slotMinutes}
            min={15}
            max={240}
            hint="Šířka jedné kostičky v kalendáři."
          />
        </div>

        <fieldset className="mt-4">
          <legend className="label">Dny, kdy lze rezervovat</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <label
                key={day.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
              >
                <input
                  type="checkbox"
                  name="openDays"
                  value={day.value}
                  defaultChecked={settings.openDays.includes(day.value)}
                  className="h-4 w-4"
                />
                {day.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowAllDay"
              defaultChecked={settings.allowAllDay}
              className="h-4 w-4"
            />
            povolit volbu „celý den“
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowOvernight"
              defaultChecked={settings.allowOvernight}
              className="h-4 w-4"
            />
            povolit rezervaci „přes noc“
          </label>
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="section-title mb-1">Vstupní kritéria pro rezervaci</h2>
        <p className="mb-4 text-sm text-slate-500">
          Týdenní příděl („tokeny“) omezuje, kolik rezervací si kantor může v jednom kalendářním
          týdnu vytvořit. Jedna souvislá rezervace = jeden token.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            name="weeklyTokens"
            label="Tokenů na týden"
            defaultValue={settings.weeklyTokens}
            min={0}
            max={50}
          />
          <NumberField
            name="maxPerDay"
            label="Max. rezervací na den"
            defaultValue={settings.maxPerDay}
            min={0}
            max={10}
            hint="0 = bez omezení"
          />
          <NumberField
            name="maxAdvanceDays"
            label="Rezervace dopředu (dní)"
            defaultValue={settings.maxAdvanceDays}
            min={1}
            max={365}
          />
          <NumberField
            name="minDurationMinutes"
            label="Nejkratší rezervace (min.)"
            defaultValue={settings.minDurationMinutes}
            min={15}
            max={1440}
          />
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="section-title mb-1">Trestné body</h2>
        <p className="mb-4 text-sm text-slate-500">
          Body uděluje správce po posouzení nahlášení od kantorů. Snižují týdenní příděl, při
          překročení limitu rezervace zcela zablokují.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            name="pointsPerTokenLoss"
            label="Bodů za −1 token"
            defaultValue={settings.pointsPerTokenLoss}
            min={0}
            max={50}
            hint="0 = příděl se nesnižuje"
          />
          <NumberField
            name="blockAtPoints"
            label="Blokace od (bodů)"
            defaultValue={settings.blockAtPoints}
            min={0}
            max={200}
            hint="0 = nikdy neblokovat"
          />
          <NumberField
            name="penaltyDecayDays"
            label="Body vyprší po (dnech)"
            defaultValue={settings.penaltyDecayDays}
            min={1}
            max={3650}
          />
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="section-title mb-3">Pravidla parkoviště</h2>
        <textarea
          name="noticeText"
          rows={4}
          maxLength={2000}
          defaultValue={settings.noticeText}
          className="field"
          placeholder="Text zobrazený kantorům na hlavní stránce…"
        />
      </div>

      <SubmitButton>Uložit nastavení</SubmitButton>
    </form>
  );
}
