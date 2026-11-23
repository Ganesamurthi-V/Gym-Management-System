import React from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';

/** Sender circle: the first letter of the name on the kit's neutral Avatar. */
export function SenderAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <Avatar alt={name} style={{ width: size, height: size }}>
      <AvatarFallback>
        <Text className="font-semibold text-muted-foreground" style={{ fontSize: size * 0.42 }}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}
