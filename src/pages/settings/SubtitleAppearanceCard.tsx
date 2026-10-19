import { t } from '@/i18n';
import { Card } from '@/components/ui/Card';
import { Field, Select, Switch } from '@/components/ui/Form';
import {
  SUBTITLE_BACKGROUNDS,
  SUBTITLE_COLORS,
  SUBTITLE_EDGES,
  SUBTITLE_SIZES,
  subtitleLineCss,
  subtitleScale,
  useSubtitleStyle,
  type SubtitleStyle,
} from '@/player/subtitleStyle';

export function SubtitleAppearanceCard() {
  const [style, setStyle] = useSubtitleStyle();
  const select = <K extends 'size' | 'color' | 'background' | 'edge'>(
    key: K,
    label: string,
    options: { value: SubtitleStyle[K]; label: string }[],
  ) => (
    <Field label={label}>
      <Select value={style[key]} onChange={(e) => setStyle({ [key]: e.target.value } as Partial<SubtitleStyle>)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <Card title={t('settings.subtitleAppearance')} description={t('settings.subtitleStyleHint')}>
      <div
        className="mb-4 flex aspect-[32/9] items-end justify-center rounded-md bg-gradient-to-br from-sky-900 via-slate-700 to-amber-800 p-4"
        aria-hidden
      >
        <span
          data-testid="subtitle-preview"
          className="rounded-sm px-[0.35em] text-center font-semibold"
          style={{ ...subtitleLineCss(style), fontSize: `${20 * subtitleScale(style)}px`, lineHeight: 1.3 }}
        >
          {t('settings.subtitlePreview')}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {select('size', t('settings.textSize'), SUBTITLE_SIZES)}
        {select('color', t('settings.textColour'), SUBTITLE_COLORS)}
        {select('background', t('settings.background'), SUBTITLE_BACKGROUNDS)}
        {select('edge', t('settings.textEdge'), SUBTITLE_EDGES)}
      </div>
      <div className="mt-3 border-t border-white/5 pt-2">
        <Switch
          label={t('settings.styledSubtitles')}
          description={t('settings.styledSubtitlesHint')}
          checked={style.styled}
          onChange={(styled) => setStyle({ styled })}
        />
      </div>
    </Card>
  );
}
