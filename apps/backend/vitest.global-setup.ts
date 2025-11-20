// Load environment variables before ANY module resolution
import dotenv from 'dotenv';

export default function setup() {
  dotenv.config();
}
