'use client';

import dynamic from 'next/dynamic';

// react-simple-keyboard touches window at import time — keep it client-only.
const TouchKeyboard = dynamic(() => import('./TouchKeyboard'), { ssr: false });

export default TouchKeyboard;
