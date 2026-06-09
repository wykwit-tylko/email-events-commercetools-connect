export type PublishOptions = {
  contentType?: string;
};

export type CommerceNotificationPublisher = {
  publish: (payload: unknown, options?: PublishOptions) => Promise<void>;
  close: () => Promise<void>;
  isReady: () => boolean;
};
