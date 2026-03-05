import { type LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<any> = {
  prefixes: ['marketplace://', 'https://marketplace.com'],
  config: {
    screens: {
      Auth: {
        screens: {
          ResetPassword: 'reset-password',
        },
      },
      Main: {
        screens: {
          HomeTab: {
            screens: {
              ProfileDetail: 'profile/:id',
            },
          },
        },
      },
    },
  },
};
