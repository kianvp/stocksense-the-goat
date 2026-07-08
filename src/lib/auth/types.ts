export type AuthUser = {
  sub: string;
  email: string;
  name: string;
  picture: string;
  givenName?: string;
  /** Unix seconds — expiry of the Google ID token this session was created from. */
  exp: number;
};

export type GoogleCredentialResponse = {
  credential: string;
  select_by: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: (
            cb?: (notification: {
              isNotDisplayed?: () => boolean;
              isSkippedMoment?: () => boolean;
              isDismissedMoment?: () => boolean;
              getDismissedReason?: () => string;
              getNotDisplayedReason?: () => string;
              getSkippedReason?: () => string;
              getMomentType?: () => string;
            }) => void,
          ) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
            },
          ) => void;
          disableAutoSelect: () => void;
          revoke: (email: string, callback: () => void) => void;
        };
      };
    };
  }
}
