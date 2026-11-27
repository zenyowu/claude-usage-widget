/** Fixed Traditional Chinese public errors keyed by error_code. */
export const ERROR_ZH = {
  missing_cli: '找不到 CLI，請確認已安裝',
  signed_out: '登入過期，請在電腦開一次 App 登入',
  api_error: '暫時讀不到額度，稍後再試',
  parse_error: '額度資料格式異常',
  timeout: '讀取逾時',
  disabled: '此來源已停用（連續失敗）',
  unknown: '未知錯誤',
};

export function publicError(code) {
  return ERROR_ZH[code] || ERROR_ZH.unknown;
}

export function emptyProvider(id, label, status, errorCode, extras = {}) {
  return {
    id,
    label,
    status,
    ok: status === 'ok',
    error: errorCode ? publicError(errorCode) : null,
    error_code: errorCode || null,
    collected_at: extras.collected_at ?? null,
    last_success_at: extras.last_success_at ?? null,
    limits: extras.limits ?? [],
    today: null,
    last30: null,
    meta: extras.meta ?? {},
  };
}
