import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Signer } from './sign_pack';
import { API_PATHS } from './api_paths';
import { APIResponse, ClientHeaders } from '../types';

/**
 * HTTP Client for making API requests
 */
export class Client {
  private sdk: any;
  private signer: Signer;
  private http: AxiosInstance;

  constructor(sdk: any) {
    this.sdk = sdk;
    this.signer = new Signer(sdk);
    this.http = axios.create({
      baseURL: API_PATHS.DevNetEndpoint,
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'SpinX-Backend/1.0'
      },
      // Prevent axios from forwarding headers that might cause IP validation issues
      transformRequest: [(data, headers) => {
        // Remove any forwarded headers that might interfere with IP whitelist
        delete headers['x-forwarded-for'];
        delete headers['x-real-ip'];
        delete headers['x-forwarded-proto'];
        delete headers['x-forwarded-host'];
        delete headers['origin'];
        delete headers['referer'];
        return data;
      }]
    });

    // Add request interceptor to log actual headers being sent
    this.http.interceptors.request.use(
      (config) => {
        console.log("🔍 === AXIOS REQUEST INTERCEPTOR ===");
        console.log("🔍 Final Request URL:", config.url);
        console.log("🔍 Final Request Headers:", JSON.stringify(config.headers, null, 2));
        console.log("🔍 Request Data:", JSON.stringify(config.data, null, 2));
        console.log("🔍 ==================================");
        return config;
      },
      (error) => {
        console.error("❌ Request interceptor error:", error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor to log response details
    this.http.interceptors.response.use(
      (response) => {
        console.log("🔍 === AXIOS RESPONSE INTERCEPTOR ===");
        console.log("🔍 Response Status:", response.status);
        console.log("🔍 Response Headers:", JSON.stringify(response.headers, null, 2));
        console.log("🔍 Response Data:", JSON.stringify(response.data, null, 2));
        console.log("🔍 ===================================");
        return response;
      },
      (error) => {
        console.error("❌ Response interceptor error:", error);
        if (error.response) {
          console.error("❌ Error Response Status:", error.response.status);
          console.error("❌ Error Response Headers:", JSON.stringify(error.response.headers, null, 2));
          console.error("❌ Error Response Data:", JSON.stringify(error.response.data, null, 2));
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a POST request with signed headers
   */
  async post<T = any>(path: string, bodyObj: Record<string, any>): Promise<APIResponse<T>> {
    const { body, timestamp, sign, clientSign } = await this.signer.signPack(bodyObj);
    console.log("body", body)
    console.log("timestamp", timestamp)
    console.log("sign", sign)
    console.log("clientSign", clientSign)
    console.log("apikey", this.sdk.getApiKey())
    
    const headers: Record<string, string> = {
      key: this.sdk.getApiKey(),
      timestamp,
      sign,
      clientSign,
    };

    // Add comprehensive header debugging
    console.log("🔍 === PAYMENT SDK REQUEST DEBUG ===");
    console.log("🔍 Request URL:", `${API_PATHS.DevNetEndpoint}${path}`);
    console.log("🔍 Request Method: POST");
    console.log("🔍 Request Headers:", JSON.stringify(headers, null, 2));
    console.log("🔍 Request Body:", JSON.stringify(body, null, 2));
    console.log("🔍 Axios Default Headers:", JSON.stringify(this.http.defaults.headers, null, 2));
    console.log("🔍 =================================");

    const resp: AxiosResponse<T> = await this.http.post(path, body, { headers });
    
    console.log("🔍 === PAYMENT SDK RESPONSE DEBUG ===");
    console.log("🔍 Response Status:", resp.status);
    console.log("🔍 Response Headers:", JSON.stringify(resp.headers, null, 2));
    console.log("🔍 Response Data:", JSON.stringify(resp.data, null, 2));
    console.log("🔍 ==================================");
    
    return {
      data: resp.data,
      headers: resp.headers
    };
  }

  /**
   * Sign client request and return client signature
   */
  async signClient(reqBody: Record<string, any>): Promise<string> {
    const { clientSign } = await this.signer.signPack(reqBody);
    return clientSign;
  }

  /**
   * Test method to check what IP the backend is using
   */
  async checkBackendIP(): Promise<void> {
    try {
      console.log("🔍 === CHECKING BACKEND IP ===");
      
      // Check what IP this backend appears to have
      const ipResponse = await fetch('https://httpbin.org/ip');
      const ipData = await ipResponse.json();
      console.log("🔍 Backend IP (from httpbin.org):", ipData.origin);
      
      // Check headers that httpbin.org sees
      const headersResponse = await fetch('https://httpbin.org/headers');
      const headersData = await headersResponse.json();
      console.log("🔍 Headers seen by httpbin.org:", JSON.stringify(headersData.headers, null, 2));
      
      console.log("🔍 ============================");
    } catch (error) {
      console.error("❌ Error checking backend IP:", error);
    }
  }
}
