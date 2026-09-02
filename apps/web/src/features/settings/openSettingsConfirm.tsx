import { Button, openModal } from '@web/ui';

export function openSettingsConfirm({
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  openModal({
    title,
    size: 'sm',
    body: (closeModal) => (
      <div className="settings-reset-confirm">
        <p>{message}</p>
        <div className="settings-cred-actions">
          <Button onClick={closeModal}>取消</Button>
          <Button
            accent
            onClick={() => {
              closeModal();
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    ),
  });
}
