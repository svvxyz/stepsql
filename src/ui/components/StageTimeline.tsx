import { useTranslation } from 'react-i18next';
import { FULL_LOGICAL_ORDER, type OutlineStage, type Step } from '../../engine';

interface Props {
  /** Steps of the last run, or null before the first run. */
  steps: Step[] | null;
  index: number;
  showAll: boolean;
  onSelect: (index: number) => void;
  hovered: OutlineStage | null;
  onHover: (stage: OutlineStage | null) => void;
}

/**
 * The whole logical order of SQL, always visible. Stages the query does not use
 * stay dimmed and cannot be selected, so students see the full order even for
 * a short query.
 */
export function StageTimeline({ steps, index, showAll, onSelect, hovered, onHover }: Props) {
  const { t, i18n } = useTranslation();
  const fmt = new Intl.NumberFormat(i18n.language);
  const activeStage = steps && !showAll ? steps[index]?.stage : undefined;
  const activePos = activeStage ? FULL_LOGICAL_ORDER.indexOf(activeStage) : -1;

  return (
    <nav className="stage-timeline" aria-label={t('steps.timeline')}>
      <ol>
        {FULL_LOGICAL_ORDER.map((stage, pos) => {
          const stepIndex = steps ? steps.findIndex((s) => s.stage === stage) : -1;
          const used = stepIndex >= 0;
          const step = used ? steps![stepIndex]! : undefined;
          const active = stage === activeStage;
          const cls = [
            'tl-item',
            used ? 'used' : 'unused',
            active ? 'active' : '',
            used && activePos > pos ? 'done' : '',
            hovered === stage ? 'hovered' : '',
            stage === 'aggregate' ? 'sub' : '',
          ].join(' ');
          return (
            <li key={stage} className={cls}>
              <button
                type="button"
                disabled={!used}
                aria-current={active ? 'step' : undefined}
                title={used ? t(`stage.${stage}.title`) : t('timeline.notUsed', { stage: t(`stage.${stage}.short`) })}
                onClick={() => onSelect(stepIndex)}
                onMouseEnter={() => onHover(stage)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(stage)}
                onBlur={() => onHover(null)}
              >
                <span className="tl-dot" aria-hidden="true" />
                <span className="tl-label">{t(`stage.${stage}.short`)}</span>
                <span className="tl-rows">{step ? fmt.format(step.stats.rowsOut) : ' '}</span>
                {!used && <span className="sr-only">{t('timeline.notUsed', { stage: t(`stage.${stage}.short`) })}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
