import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

/**
 * Agent Society 视觉规范映射
 * 基于 PrimeVue Aura 预设进行扩展，对接 tokens.ts 中的语义定义
 */
export const MyPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '#ECFDF5',
            100: '#D1FAE5',
            200: '#A7F3D0',
            300: '#6EE7B7',
            400: '#34D399',
            500: '#16B981', // Light Primary
            600: '#059669',
            700: '#047857',
            800: '#065F46',
            900: '#064E3B',
            950: '#022C22'
        },
        colorScheme: {
            light: {
                surface: {
                    0: '#ffffff',     // surface-1 (N0)
                    50: '#F7F8FB',    // bg (N1)
                    100: '#EEF2F7',   // surface-2 (N2)
                    200: '#F0F4F8',   // surface-3 (N3)
                    300: '#E2E8F0',   
                    400: '#CBD5E1',   
                    500: '#94A3B8',   
                    600: '#475569',   // text-2 (N8)
                    700: '#334155',
                    800: '#0F172A',   // text-1 (N10/N12)
                    900: '#0F172A',
                    950: '#020617'
                },
                primary: {
                    color: '{primary.500}',
                    contrastColor: '#ffffff',
                    hoverColor: '{primary.600}',
                    activeColor: '{primary.700}'
                }
            },
            dark: {
                surface: {
                    0: '#0B0F17',     // bg (N0)
                    50: '#0F172A',    // surface-2 (N1)
                    100: '#151B26',   // surface-1 (N2)
                    200: '#1E293B',   // surface-3 (N3)
                    300: '#2A3A55',   // border (N6)
                    400: '#3F4E65',
                    500: '#6B7280',   // text-3 (N8)
                    600: '#9CA3AF',   // text-2 (N9)
                    700: '#CBD5E1',
                    800: '#EEF2F7',   // text-1 (N10/N12)
                    900: '#F8FAFC',
                    950: '#FFFFFF'
                },
                primary: {
                    color: '#2DD36F', // Dark Primary
                    contrastColor: '#000000',
                    hoverColor: '#26B35F',
                    activeColor: '#1F924D'
                }
            }
        }
    }
});
