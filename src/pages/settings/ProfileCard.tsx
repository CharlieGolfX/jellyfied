import { Camera, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { t } from '@/i18n';
import { Avatar } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { fileToBase64 } from '@/lib/fileToBase64';

export function ProfileCard({ user }: { user: UserDto }) {
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const data = await fileToBase64(file);
      await api.request('POST', '/UserImage', { query: { userId }, rawBody: { data, contentType: file.type || 'image/jpeg' } });
    },
    onSuccess: () => {
      toast.success(t('settings.profilePictureUpdated'));
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });
  const deleteImage = useMutation({
    mutationFn: () => api.delete('/UserImage', { userId }),
    onSuccess: () => {
      toast.success(t('settings.profilePictureRemoved'));
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Card title={t('settings.profile')}>
      <div className="flex items-center gap-5">
        <Avatar userId={user.Id} tag={user.PrimaryImageTag} name={user.Name} size={80} />
        <div className="space-y-2">
          <div className="text-lg font-semibold">{user.Name}</div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage.mutate(f);
                e.target.value = '';
              }}
            />
            <Button size="sm" icon={<Camera size={14} />} loading={uploadImage.isPending} onClick={() => fileRef.current?.click()}>
              {t('settings.changePicture')}
            </Button>
            {user.PrimaryImageTag && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                loading={deleteImage.isPending}
                onClick={() => deleteImage.mutate()}
              >
                {t('settings.remove')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
