export const salesTools = [
  {
    name: 'send_upgrade_email',
    description:
      'Sendet dem Interessenten eine E-Mail mit dem Link zum gewählten CoinTracking Plan. Nur aufrufen wenn der User explizit zustimmt, eine E-Mail zu erhalten.',
    parameters: {
      type: 'object' as const,
      properties: {
        recipient: {
          type: 'string',
          description: 'E-Mail-Adresse des Interessenten',
        },
        plan_name: {
          type: 'string',
          description: 'Name des besprochenen Plans, z.B. "Pro", "Expert 20k", "Starter"',
        },
        upgrade_url: {
          type: 'string',
          description: 'URL zur Upgrade-Seite. Immer https://cointracking.info/pricing verwenden.',
        },
      },
      required: ['recipient', 'plan_name', 'upgrade_url'],
    },
  },
]
