import type { InvoiceStatistics } from '../../shared/types';
import { categoryLabels } from '../../shared/types';
import { useInvoiceStore } from '../store/useInvoiceStore';

interface SettingsPanelProps {
  statistics: InvoiceStatistics;
  blockers: string[];
  statusCounts: Record<'analyzing' | 'review' | 'error' | 'confirmed', number>;
  isGenerating: boolean;
  hasFreshPreview: boolean;
  onGenerate: () => void;
}

function money(amount: string): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

export function SettingsPanel({
  statistics,
  blockers,
  statusCounts,
  isGenerating,
  hasFreshPreview,
  onGenerate,
}: SettingsPanelProps) {
  const settings = useInvoiceStore((state) => state.settings);
  const updateSettings = useInvoiceStore((state) => state.updateSettings);
  const setNotice = useInvoiceStore((state) => state.setNotice);
  const nonEmptyStatistics = statistics.byCategory.filter((item) => item.count > 0);
  const disabled = blockers.length > 0 || isGenerating;

  const attemptGenerate = () => {
    if (blockers.length > 0) {
      setNotice(blockers[0]);
      return;
    }
    onGenerate();
  };

  return (
    <aside className="settings-panel" aria-label="排版与统计">
      <section className="panel-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LAYOUT</span>
            <h2>排版设置</h2>
          </div>
          <span className="status-chip">A4 纵向</span>
        </div>

        <div className="layout-presets">
          <div className="preset-card active">
            <div className="mini-page two-up">
              <i />
              <i />
            </div>
            <div>
              <strong>普通票据</strong>
              <span>每页 2 份</span>
            </div>
          </div>
          <div className="preset-card">
            <div className="mini-page eight-up">
              {Array.from({ length: 8 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
            <div>
              <strong>铁路票据</strong>
              <span>每页 8 份</span>
            </div>
          </div>
        </div>

        <label className="setting-row">
          <span>
            <strong>页面边距</strong>
            <small>范围 0–20 mm</small>
          </span>
          <span className="number-control">
            <input
              aria-label="页面边距"
              type="number"
              min="0"
              max="20"
              step="1"
              value={settings.marginMm}
              onChange={(event) =>
                updateSettings({ marginMm: Math.min(20, Math.max(0, Number(event.target.value))) })
              }
            />
            mm
          </span>
        </label>

        <label className="setting-row switch-row">
          <span>
            <strong>显示裁切线</strong>
            <small>中央对折线会加粗</small>
          </span>
          <input
            aria-label="显示裁切线"
            type="checkbox"
            checked={settings.showCutLines}
            onChange={(event) => updateSettings({ showCutLines: event.target.checked })}
          />
        </label>

        <label className="setting-row switch-row">
          <span>
            <strong>包含汇总页</strong>
            <small>仅加入总打印包</small>
          </span>
          <input
            aria-label="包含汇总页"
            type="checkbox"
            checked={settings.includeSummary}
            onChange={(event) => updateSettings({ includeSummary: event.target.checked })}
          />
        </label>
      </section>

      <section className="panel-section statistics-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SUMMARY</span>
            <h2>金额统计</h2>
          </div>
          <span className="count-chip">{statistics.totalCount} 份</span>
        </div>

        <div className="processing-grid">
          <span>
            分析中 <strong>{statusCounts.analyzing}</strong>
          </span>
          <span>
            待复核 <strong>{statusCounts.review}</strong>
          </span>
          <span>
            失败 <strong>{statusCounts.error}</strong>
          </span>
          <span>
            已确认 <strong>{statusCounts.confirmed}</strong>
          </span>
        </div>

        <div className="total-card">
          <span>报销总金额</span>
          <strong>{money(statistics.totalAmount)}</strong>
          <small>{statistics.valuedCount} 份已识别或填写金额</small>
        </div>

        <div className="category-statistics">
          {nonEmptyStatistics.length === 0 ? (
            <p className="statistics-empty">导入并分析后，这里会显示分类小计。</p>
          ) : (
            nonEmptyStatistics.map((item) => (
              <div className="category-stat" key={item.category}>
                <span>
                  <i className={`category-dot ${item.category}`} />
                  {categoryLabels[item.category]}
                  <small>{item.count}</small>
                </span>
                <strong>{money(item.amount)}</strong>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="panel-actions">
        {blockers.length > 0 && statistics.totalCount > 0 && (
          <div className="generation-blocker">{blockers[0]}</div>
        )}
        <button
          type="button"
          className="secondary-action"
          disabled={disabled}
          onClick={attemptGenerate}
        >
          打印
        </button>
        <button
          type="button"
          className="primary-action"
          disabled={disabled}
          onClick={attemptGenerate}
        >
          {isGenerating ? '正在生成…' : hasFreshPreview ? '打开最新预览' : '生成 A4 PDF'}
        </button>
        <p>生成前必须完成金额、分类和低置信度结果复核。</p>
      </div>
    </aside>
  );
}
