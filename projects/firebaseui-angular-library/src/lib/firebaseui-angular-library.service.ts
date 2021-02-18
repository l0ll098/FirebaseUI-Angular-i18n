import { Inject, Injectable, NgZone, Optional } from '@angular/core';
import { FirebaseApp, FirebaseAppConfig, FirebaseOptions, FIREBASE_APP_NAME, FIREBASE_OPTIONS, ɵfirebaseAppFactory } from '@angular/fire';
import { USE_EMULATOR as USE_AUTH_EMULATOR } from '@angular/fire/auth';
import _firebase from 'firebase/app';
import * as firebaseui from 'firebaseui';
import { Observable, Observer } from 'rxjs';
import { DynamicLoaderService, Resource } from './dynamic-loader.service';
import { ExtendedFirebaseUIAuthConfig, FirebaseUILanguages, FIREBASEUI_CDN_URL } from './firebaseui-angular-library.helper';

type UseEmulatorArguments = [string, number];

@Injectable()
export class FirebaseuiAngularLibraryService {

  public static firebaseUiInstance: firebaseui.auth.AuthUI | undefined = undefined;

  private static firebaseUiInstance$: Observable<firebaseui.auth.AuthUI> | undefined = undefined;
  private static observer: Observer<firebaseui.auth.AuthUI> | undefined = undefined;

  private static currentLanguageCode: string = "";
  private static firstLoad: boolean = true;

  private firebaseInstance: FirebaseApp;

  constructor(
    @Inject('firebaseUIAuthConfig') private _firebaseUiConfig: ExtendedFirebaseUIAuthConfig,
    @Inject(FIREBASE_OPTIONS) options: FirebaseOptions,
    @Optional() @Inject(FIREBASE_APP_NAME) nameOrConfig: string | FirebaseAppConfig | null | undefined,
    @Optional() @Inject(USE_AUTH_EMULATOR) private _useEmulator: any, // can't use the tuple here
    private _scriptLoaderService: DynamicLoaderService,
    zone: NgZone) {

    // noinspection JSNonASCIINames
    this.firebaseInstance = ɵfirebaseAppFactory(options, zone, nameOrConfig);

    FirebaseuiAngularLibraryService.firebaseUiInstance$ = new Observable((observer) => {
      FirebaseuiAngularLibraryService.observer = observer;
    });

    if (!FirebaseuiAngularLibraryService.firebaseUiInstance) {
      this.setLanguage(this._firebaseUiConfig.language);
    }

  }

  private instantiateFirebaseUI() {
    const auth: _firebase.auth.Auth = this.firebaseInstance.auth();
    if (this._useEmulator) {
      auth.useEmulator(`http://${this._useEmulator.join(':')}`);
    }

    // FirebaseuiAngularLibraryService.firebaseUiInstance = new firebaseui.auth.AuthUI(auth);
    const instance = new firebaseui.auth.AuthUI(auth);
    FirebaseuiAngularLibraryService.observer.next(instance);
  }

  //#region Changes made to the original lib to support i18n

  async setLanguage(languageCode: string) {

    if (FirebaseuiAngularLibraryService.firebaseUiInstance) {
      await FirebaseuiAngularLibraryService.firebaseUiInstance.delete();
    }

    const previousLanguageCode = FirebaseuiAngularLibraryService.currentLanguageCode;
    const previousLanguage = previousLanguageCode ? this.getLanguageByCode(previousLanguageCode) : null;

    FirebaseuiAngularLibraryService.currentLanguageCode = languageCode ? languageCode.toLowerCase() : "en";

    if (!languageCode || (languageCode.toLowerCase() === "en" && FirebaseuiAngularLibraryService.firstLoad)) {
      console.log("[service] using lib from npm bundles");
      return this.instantiateFirebaseUI();
    }

    FirebaseuiAngularLibraryService.firstLoad = false;
    const languages = FirebaseUILanguages.filter((l) => l.code.toLowerCase() === languageCode.toLowerCase());

    if (languages.length !== 1) {
      throw new Error("Invalid language code");
    }

    // Otherwise we'll use a version of the same library from CDN.
    // Expose a reference to the firebase object or the firebaseui won't work
    if (typeof window !== "undefined" && typeof window.firebase === "undefined") {
      // Semi-cheat: firebaseAppInstance is an instance of FirebaseApp, 
      // but FirebaseUI uses an instance of the "vanilla" Firebase object (hence the cast to any and the "".firebase_" part)
      window.firebase = (this.firebaseInstance as any).firebase_;
    }

    const language = languages[0];
    const toLoad: Resource[] = [
      {
        name: `firebaseui-${language.code}`,
        type: "js",
        src: `${FIREBASEUI_CDN_URL}/firebase-ui-auth__${language.code}.js`
      }
    ];

    // If the selected language is a Right to Left one, load also the special css file
    if (language.isRtL) {
      toLoad.push({
        name: "firebaseui-css-rtl",
        type: "css",
        src: `${FIREBASEUI_CDN_URL}/firebase-ui-auth-rtl.css`
      });
    }

    // If we had previsouly loaded another language that was a RtL one and current one is not, 
    //    we need to load the LtR css
    if (previousLanguage && previousLanguage.isRtL && !language.isRtL) {
      toLoad.push({
        name: "firebaseui-css",
        type: "css",
        src: `${FIREBASEUI_CDN_URL}/firebase-ui-auth.css`
      });
    }

    await this._scriptLoaderService.registerAndLoad(...toLoad);

    // and create a new firebaseui instance, using the imported firebaseui
    return this.instantiateFirebaseUI();
  }

  /**
  * Returns the currently selected language, as an instance of FirebaseUILanguage.
  * It could return null if the current language can't be parsed.
  */
  getCurrentLanguage() {
    return this.getLanguageByCode(FirebaseuiAngularLibraryService.currentLanguageCode);
  }

  private getLanguageByCode(code: string) {
    const matching = FirebaseUILanguages.filter((lang) => lang.code.toLowerCase() === code.toLowerCase());

    if (matching.length === 1) {
      return matching[0];
    }

    return null;
  }

  /**
   * This method returns the firebaseui instance once it's available.
   */
  getFirebaseUiInstance(): Promise<firebaseui.auth.AuthUI> {
    return new Promise((resolve, reject) => {
      FirebaseuiAngularLibraryService.firebaseUiInstance$.subscribe((instance) => {
        return resolve(instance);
      });
    });

  }

  //#endregion

}
