import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'shared-iterations',
      vus: 200,
      iterations: 223000,
      maxDuration: '2m',
    },
  },
};

export function setup() {
  const baseUrl = 'http://localhost:3000/api/v1';

  // 1. Initialize Stock to 10000 for the stress test
  http.post(`${baseUrl}/stock/initialize`, JSON.stringify({ quantity: 43000 }), {
    headers: { 'Content-Type': 'application/json' },
  });

  // 2. Register a test user
  const creds = JSON.stringify({
    username: "k6_stress_user",
    email: "k6_stress@test.com",
    password: "password123"
  });
  
  const params = { headers: { 'Content-Type': 'application/json' } };
  http.post(`${baseUrl}/auth/register`, creds, params);

  // 3. Login to get token
  const loginRes = http.post(`${baseUrl}/auth/login`, creds, params);
  
  let token = "";
  if (loginRes.status === 200) {
      const body = JSON.parse(loginRes.body);
      token = body.data.accessToken;
  } else {
      console.error("Login failed in setup phase!");
  }
  
  return { token: token };
}

export default function (data) {
  const url = 'http://localhost:3000/api/v1/orders/create';
  
  const payload = JSON.stringify({
    productId: "item:1",
    quantity: 1
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${data.token}`,
      'Cookie': `accessToken=${data.token}`
    },
  };

  const res = http.post(url, payload, params);
  
  // Verify that it either succeeded or correctly reported out of stock
  check(res, {
    'is status 201 (Ordered) or 400 (Out of stock)': (r) => r.status === 201 || r.status === 400,
  });
}