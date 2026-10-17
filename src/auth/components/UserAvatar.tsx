'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  size?: 'sm' | 'default' | 'lg';
  onClick?: () => void;
}

export default function UserAvatar({
  name,
  avatarUrl,
  avatarColor,
  size = 'default',
  onClick,
}: UserAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Avatar size={size} onClick={onClick} className="cursor-pointer hover:ring-2 hover:ring-primary transition-all">
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback style={avatarColor ? { backgroundColor: avatarColor, color: 'white' } : undefined}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
