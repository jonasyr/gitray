#!/bin/bash

# GitRay Development Environment Manager
# Professional monorepo management script with service orchestration

set -euo pipefail

# ============================================================================
# CONFIGURATION & CONSTANTS
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/.gitray.log"
CONFIG_FILE="$SCRIPT_DIR/.gitray.config"
PID_FILE="$SCRIPT_DIR/.gitray.pid"

# Service definitions
declare -A SERVICES=(
    ["redis"]="Redis Cache Server"
    ["backend"]="Backend API Server" 
    ["frontend"]="Frontend Development Server"
    ["shared-types"]="Shared Types Watcher"
)

declare -A SERVICE_PORTS=(
    ["redis"]="6379"
    ["backend"]="3001"
    ["frontend"]="5173"
)

declare -A SERVICE_COMMANDS=(
    ["redis"]="docker run --name gitray-redis -d -p 6379:6379 redis:7-alpine"
    ["backend"]="pnpm --filter backend run dev"
    ["frontend"]="pnpm --filter frontend run dev"
    ["shared-types"]="pnpm --filter @gitray/shared-types run watch"
)

# Colors and styling
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly GRAY='\033[0;37m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly NC='\033[0m'

# Icons
readonly ICON_SUCCESS="✅"
readonly ICON_ERROR="❌"
readonly ICON_WARNING="⚠️"
readonly ICON_INFO="ℹ️"
readonly ICON_ROCKET="🚀"
readonly ICON_GEAR="⚙️"
readonly ICON_CLEAN="🧹"
readonly ICON_TEST="🧪"
readonly ICON_DOCKER="🐳"
readonly ICON_SERVER="🖥️"
readonly ICON_DATABASE="🗄️"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

print_header() {
    clear
    echo -e "${MAGENTA}${BOLD}"
    cat << 'EOF'
   ██████╗ ██╗████████╗██████╗  █████╗ ██╗   ██╗
  ██╔════╝ ██║╚══██╔══╝██╔══██╗██╔══██╗╚██╗ ██╔╝
  ██║  ███╗██║   ██║   ██████╔╝███████║ ╚████╔╝ 
  ██║   ██║██║   ██║   ██╔══██╗██╔══██║  ╚██╔╝  
  ╚██████╔╝██║   ██║   ██║  ██║██║  ██║   ██║   
   ╚═════╝ ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   
EOF
    echo -e "${NC}${WHITE}Git Visualization Development Environment${NC}"
    echo -e "${DIM}Professional monorepo orchestration${NC}"
    echo -e "${GRAY}$(printf '%.0s─' {1..50})${NC}"
    echo
}

print_status_line() {
    local service="$1"
    local status="$2"
    local port="$3"
    local icon color
    
    case "$status" in
        "running") icon="${ICON_SUCCESS}" color="${GREEN}" ;;
        "stopped") icon="${ICON_ERROR}" color="${RED}" ;;
        "starting") icon="${YELLOW}⚡${NC}" color="${YELLOW}" ;;
        *) icon="${ICON_WARNING}" color="${YELLOW}" ;;
    esac
    
    printf "  %-15s %s ${color}%-8s${NC}" "$service" "$icon" "$status"
    [ -n "$port" ] && printf " ${DIM}:$port${NC}"
    echo
}

spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while ps -p $pid > /dev/null 2>&1; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

check_dependencies() {
    local missing=()
    
    command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v node >/dev/null 2>&1 || missing+=("node")
    
    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}${ICON_ERROR} Missing dependencies: ${missing[*]}${NC}"
        echo -e "${YELLOW}Please install missing dependencies and retry${NC}"
        exit 1
    fi
}

check_port() {
    local port="$1"
    lsof -i ":$port" >/dev/null 2>&1
}

get_service_status() {
    local service="$1"
    local port="${SERVICE_PORTS[$service]:-}"
    
    case "$service" in
        "redis")
            if docker ps --format "table {{.Names}}" | grep -q "gitray-redis"; then
                echo "running"
            else
                echo "stopped"
            fi
            ;;
        "frontend")
            # Check for any Vite process running, and get actual port if different
            if pgrep -f "vite" >/dev/null 2>&1; then
                echo "running"
            else
                echo "stopped"
            fi
            ;;
        *)
            if [ -n "$port" ] && check_port "$port"; then
                echo "running"
            else
                echo "stopped"
            fi
            ;;
    esac
}

show_system_status() {
    local overwrite="${1:-false}"
    
    # If overwriting, move cursor up to clear previous status
    if [ "$overwrite" = "true" ]; then
        # Calculate actual lines to clear:
        # 1 (header) + 1 (blank) + 4 (services) + 1 (blank) + 1 (log file) + 1 (separator) + 1 (blank) = 10 lines
        printf "\033[10A"
        # Clear from cursor to end of screen
        printf "\033[J"
    fi
    
    echo -e "${BOLD}${BLUE}${ICON_SERVER} System Status${NC}"
    echo
    
    for service in "${!SERVICES[@]}"; do
        local status=$(get_service_status "$service")
        local port="${SERVICE_PORTS[$service]:-}"
        print_status_line "${SERVICES[$service]}" "$status" "$port"
    done
    
    echo
    echo -e "${DIM}Log file: $LOG_FILE${NC}"
    echo -e "${GRAY}$(printf '%.0s─' {1..50})${NC}"
    echo
}

# ============================================================================
# SERVICE MANAGEMENT
# ============================================================================

start_service() {
    local service="$1"
    local cmd="${SERVICE_COMMANDS[$service]}"
    local show_logs="${2:-true}"
    
    echo -e "${BLUE}${ICON_GEAR} Starting ${SERVICES[$service]}...${NC}"
    
    case "$service" in
        "redis")
            # Stop existing container if running
            docker stop gitray-redis 2>/dev/null || true
            docker rm gitray-redis 2>/dev/null || true
            
            if eval "$cmd" >/dev/null 2>&1; then
                echo -e "${GREEN}${ICON_DATABASE} Redis started successfully${NC}"
                log "Redis container started"
            else
                echo -e "${RED}${ICON_ERROR} Failed to start Redis${NC}"
                echo -e "${DIM}Check: docker ps${NC}"
                return 1
            fi
            ;;
        "shared-types")
            echo -e "${YELLOW}Building shared types...${NC}"
            if pnpm --filter @gitray/shared-types build; then
                echo -e "${GREEN}${ICON_SUCCESS} Shared types built successfully${NC}"
            else
                echo -e "${RED}${ICON_ERROR} Failed to build shared types${NC}"
                return 1
            fi
            ;;
        *)
            local log_file="$SCRIPT_DIR/.$service.log"
            echo -e "${BLUE}Starting $service in background...${NC}"
            
            # Start service and capture PID
            $cmd > "$log_file" 2>&1 &
            local pid=$!
            echo $pid > "$SCRIPT_DIR/.$service.pid"
            
            # Wait a moment for service to initialize
            sleep 3
            
            # Check if process is still running
            if ! kill -0 $pid 2>/dev/null; then
                echo -e "${RED}${ICON_ERROR} Failed to start $service${NC}"
                echo -e "${YELLOW}Last few lines from log:${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                tail -10 "$log_file" 2>/dev/null || echo "No log output available"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                return 1
            fi
            
            # Show initial startup logs
            if [[ "$show_logs" == "true" ]]; then
                echo -e "${GREEN}${ICON_SUCCESS} $service started (PID: $pid)${NC}"
                echo -e "${DIM}Initial output:${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                tail -5 "$log_file" 2>/dev/null || echo "Waiting for output..."
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
            fi
            ;;
    esac
}

stop_service() {
    local service="$1"
    
    case "$service" in
        "redis")
            docker stop gitray-redis 2>/dev/null || true
            docker rm gitray-redis 2>/dev/null || true
            echo -e "${YELLOW}Redis stopped${NC}"
            ;;
        *)
            local pid_file="$SCRIPT_DIR/.$service.pid"
            if [ -f "$pid_file" ]; then
                local pid=$(cat "$pid_file")
                kill "$pid" 2>/dev/null || true
                rm -f "$pid_file"
                echo -e "${YELLOW}${service} stopped${NC}"
            fi
            ;;
    esac
}

stop_all_services() {
    echo -e "${YELLOW}${ICON_WARNING} Stopping all services...${NC}"
    
    for service in "${!SERVICES[@]}"; do
        stop_service "$service" >/dev/null 2>&1
    done
    
    # Clean up any remaining processes
    pkill -f "pnpm.*dev" 2>/dev/null || true
    
    echo -e "${GREEN}${ICON_SUCCESS} All services stopped${NC}"
}

# ============================================================================
# DEVELOPMENT WORKFLOWS
# ============================================================================

full_development_setup() {
    echo -e "${MAGENTA}${ICON_ROCKET} Full Development Setup${NC}"
    echo
    
    # 1. Install dependencies
    echo -e "${BLUE}${ICON_GEAR} Installing dependencies...${NC}"
    if [ -f "pnpm-lock.yaml" ]; then
        if ! pnpm install --frozen-lockfile; then
            echo -e "${RED}${ICON_ERROR} Failed to install dependencies${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}${ICON_WARNING} No lockfile found, generating one...${NC}"
        if ! pnpm install; then
            echo -e "${RED}${ICON_ERROR} Failed to install dependencies${NC}"
            return 1
        fi
    fi
    
    # 2. Build shared types
    echo -e "${BLUE}${ICON_GEAR} Building shared types...${NC}"
    if ! pnpm --filter @gitray/shared-types build; then
        echo -e "${RED}${ICON_ERROR} Failed to build shared types${NC}"
        return 1
    fi
    
    # 3. Start Redis
    start_service "redis" false
    
    # 4. Start backend
    echo
    start_service "backend"
    
    # 5. Start frontend  
    echo
    start_service "frontend"
    
    echo
    echo -e "${GREEN}${ICON_SUCCESS} Development environment ready!${NC}"
    echo -e "${CYAN}Frontend: http://localhost:${SERVICE_PORTS[frontend]}${NC}"
    echo -e "${CYAN}Backend:  http://localhost:${SERVICE_PORTS[backend]}${NC}"
    echo -e "${CYAN}Redis:    http://localhost:${SERVICE_PORTS[redis]}${NC}"
    echo
    echo -e "${YELLOW}Commands available:${NC}"
    echo -e "${DIM}  • Press 'l' to view live logs${NC}"
    echo -e "${DIM}  • Press 's' to show service status${NC}"
    echo -e "${DIM}  • Press Ctrl+C to stop all services and exit${NC}"
    echo -e "${DIM}  • In logs: Press 'q' to return to monitoring${NC}"
    echo
    
    # Interactive monitoring loop
    local exiting=false
    local initial_status_shown=false
    trap 'exiting=true; echo -e "\n${YELLOW}Stopping all services and exiting...${NC}"; stop_all_services; echo -e "${DIM}Final status:${NC}"; show_system_status; echo -e "${GREEN}All services stopped.${NC}"; echo -e "${GREEN}Thank you for using GitRay! ${ICON_SUCCESS}${NC}"; exit 0' INT
    
    # Show status every 10 seconds automatically
    local status_counter=0
    while true; do
        # Exit immediately if Ctrl+C was pressed
        if [ "$exiting" = true ]; then
            break
        fi
        
        read -t 1 -n 1 input 2>/dev/null || {
            status_counter=$((status_counter + 1))
            if [ $status_counter -ge 10 ]; then
                if [ "$initial_status_shown" = "false" ]; then
                    echo -e "${DIM}Auto-refresh: $(date '+%H:%M:%S')${NC}"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                    initial_status_shown=true
                else
                    # Move cursor up to overwrite the entire status block including timestamp and commands
                    # 1 (auto-refresh) + 10 (status) + 1 (commands) + 1 (blank) = 13 lines
                    printf "\033[13A"
                    printf "\033[J"
                    echo -e "${DIM}Auto-refresh: $(date '+%H:%M:%S')${NC}"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                fi
                status_counter=0
            fi
            continue
        }
        
        case "$input" in
            'l'|'L')
                status_counter=0
                echo
                echo -e "${CYAN}${ICON_INFO} Live Logs (Press 'q' to return)${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..60})${NC}"
                
                # Start log viewing in background
                tail -f "$SCRIPT_DIR"/.backend.log "$SCRIPT_DIR"/.frontend.log 2>/dev/null &
                local tail_pid=$!
                
                # Wait for 'q' to exit logs
                while true; do
                    read -t 1 -n 1 log_input 2>/dev/null || continue
                    if [[ "$log_input" == "q" || "$log_input" == "Q" ]]; then
                        kill $tail_pid 2>/dev/null
                        echo -e "\n${GREEN}${ICON_SUCCESS} Returned to monitoring${NC}"
                        echo
                        show_system_status
                        echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                        echo
                        initial_status_shown=true
                        break
                    fi
                done
                ;;
            's'|'S')
                status_counter=0
                if [ "$initial_status_shown" = "true" ]; then
                    # Move cursor up to overwrite the commands line and status block
                    # 1 (commands) + 1 (blank) = 2 lines to get back to status start
                    printf "\033[2A"
                    printf "\033[J"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                else
                    echo
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                    initial_status_shown=true
                fi
                ;;
        esac
    done
}

quick_start() {
    echo -e "${YELLOW}${ICON_ROCKET} Quick Start (Frontend Only)${NC}"
    echo
    
    # Check if types are built
    if [ ! -d "packages/shared-types/dist" ]; then
        echo -e "${BLUE}Building shared types...${NC}"
        pnpm --filter @gitray/shared-types build
    fi
    
    start_service "frontend"
    
    echo -e "${GREEN}${ICON_SUCCESS} Frontend ready at http://localhost:${SERVICE_PORTS[frontend]}${NC}"
}

production_build() {
    echo -e "${MAGENTA}${ICON_GEAR} Production Build${NC}"
    echo
    
    echo -e "${BLUE}Cleaning previous builds...${NC}"
    pnpm run clean:dist
    
    echo -e "${BLUE}Installing dependencies...${NC}"
    if [ -f "pnpm-lock.yaml" ]; then
        pnpm install --frozen-lockfile
    else
        echo -e "${YELLOW}${ICON_WARNING} No lockfile found, generating one...${NC}"
        pnpm install
    fi
    
    echo -e "${BLUE}Building all packages...${NC}"
    pnpm run build
    
    echo -e "${GREEN}${ICON_SUCCESS} Production build completed!${NC}"
    echo -e "${DIM}Build artifacts are in packages/*/dist and apps/*/dist${NC}"
}

run_tests() {
    echo -e "${CYAN}${ICON_TEST} Test Suite${NC}"
    echo
    
    echo "1) ${ICON_TEST} Run all tests"
    echo "2) ${ICON_TEST} Frontend tests only"
    echo "3) ${ICON_TEST} Backend tests only"
    echo "4) ${ICON_TEST} Tests with coverage"
    echo "5) ${ICON_TEST} Watch mode"
    echo
    
    read -p "Choose test option (1-5): " choice
    
    case $choice in
        1) pnpm run test ;;
        2) pnpm run test:frontend ;;
        3) pnpm run test:backend ;;
        4) pnpm run test:coverage ;;
        5) pnpm run test:watch ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
}

clean_environment() {
    echo -e "${RED}${ICON_CLEAN} Environment Cleanup${NC}"
    echo
    echo -e "${YELLOW}This will remove all build artifacts, dependencies, and stop services${NC}"
    read -p "Are you sure? (y/N): " confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        stop_all_services
        echo -e "${BLUE}Cleaning build artifacts...${NC}"
        pnpm run clean
        echo -e "${GREEN}${ICON_SUCCESS} Environment cleaned${NC}"
    fi
}

# ============================================================================
# INTERACTIVE MENU
# ============================================================================

show_main_menu() {
    while true; do
        print_header
        show_system_status
        
        echo -e "${BOLD}${WHITE}Development Actions:${NC}"
        echo
        echo "  1) ${ICON_ROCKET} Full Setup    (Redis + Backend + Frontend)"
        echo "  2) ${ICON_SERVER} Quick Start   (Frontend only)"
        echo "  3) ${ICON_GEAR} Production     (Build for production)"
        echo "  4) ${ICON_TEST} Test Suite     (Run tests)"
        echo "  5) ${ICON_CLEAN} Clean          (Reset environment)"
        echo "  6) ${ICON_DOCKER} Services       (Manage individual services)"
        echo "  7) ${ICON_INFO} Logs           (View service logs)"
        echo -e "  8) ${RED}Exit${NC}"
        echo
        
        read -p "Choose action (1-8): " choice
        
        case $choice in
            1) full_development_setup ;;
            2) quick_start ;;
            3) production_build ;;
            4) run_tests ;;
            5) clean_environment ;;
            6) service_management_menu ;;
            7) show_logs ;;
            8) 
                stop_all_services
                echo -e "${GREEN}Thank you for using GitRay! ${ICON_SUCCESS}${NC}"
                exit 0
                ;;
            *) 
                echo -e "${RED}Invalid choice. Please try again.${NC}"
                sleep 1
                ;;
        esac
    done
}

service_management_menu() {
    while true; do
        print_header
        show_system_status
        
        echo -e "${BOLD}${WHITE}Service Management:${NC}"
        echo
        echo "  1) Start Redis"
        echo "  2) Start Backend"
        echo "  3) Start Frontend"
        echo "  4) Stop All Services"
        echo "  5) Restart All Services"
        echo "  6) Back to Main Menu"
        echo
        
        read -p "Choose action (1-6): " choice
        
        case $choice in
            1) start_service "redis" ;;
            2) start_service "backend" ;;
            3) start_service "frontend" ;;
            4) stop_all_services ;;
            5) 
                stop_all_services
                sleep 2
                start_service "redis"
                start_service "backend"
                start_service "frontend"
                ;;
            6) break ;;
            *) echo -e "${RED}Invalid choice${NC}" ;;
        esac
        
        echo
        read -p "Press Enter to continue..."
    done
}

show_logs() {
    echo -e "${CYAN}${ICON_INFO} Service Logs${NC}"
    echo
    echo "1) ${ICON_INFO} Live Combined Logs (All services)"
    echo "2) ${ICON_SERVER} Backend Logs"
    echo "3) ${ICON_SERVER} Frontend Logs"
    echo "4) ${ICON_GEAR} GitRay Main Log"
    echo "5) ${ICON_WARNING} Recent Errors Only"
    echo "6) ${ICON_INFO} Service Status + Last 10 Lines"
    echo
    
    read -p "Choose log view (1-6): " choice
    
    echo -e "${GRAY}$(printf '%.0s─' {1..60})${NC}"
    echo -e "${DIM}Press 'q' to return to menu (or Ctrl+C to exit completely)${NC}"
    echo -e "${GRAY}$(printf '%.0s─' {1..60})${NC}"
    
    case $choice in
        1) 
            if [ -f "$SCRIPT_DIR/.backend.log" ] || [ -f "$SCRIPT_DIR/.frontend.log" ]; then
                # Use multitail if available, otherwise fall back to tail
                if command -v multitail >/dev/null 2>&1; then
                    multitail -s 2 -sn 1,3 \
                        -ci green -t "Backend" "$SCRIPT_DIR/.backend.log" \
                        -ci blue -t "Frontend" "$SCRIPT_DIR/.frontend.log" 2>/dev/null
                else
                    tail -f "$SCRIPT_DIR"/.backend.log "$SCRIPT_DIR"/.frontend.log 2>/dev/null
                fi
            else
                echo "No service logs available. Start some services first."
            fi
            ;;
        2) 
            [ -f "$SCRIPT_DIR/.backend.log" ] && tail -f "$SCRIPT_DIR/.backend.log" || echo "Backend not running"
            ;;
        3) 
            [ -f "$SCRIPT_DIR/.frontend.log" ] && tail -f "$SCRIPT_DIR/.frontend.log" || echo "Frontend not running"
            ;;
        4) 
            [ -f "$LOG_FILE" ] && tail -f "$LOG_FILE" || echo "No main log file found"
            ;;
        5)
            echo -e "${RED}Recent Errors:${NC}"
            grep -i "error\|fail\|exception" "$SCRIPT_DIR"/.*.log 2>/dev/null | tail -20 || echo "No recent errors found"
            read -p "Press Enter to continue..."
            ;;
        6)
            show_system_status
            echo -e "${CYAN}Recent Log Output:${NC}"
            for service in backend frontend; do
                local log_file="$SCRIPT_DIR/.$service.log"
                if [ -f "$log_file" ]; then
                    echo -e "${YELLOW}Last 10 lines from $service:${NC}"
                    tail -10 "$log_file" 2>/dev/null
                    echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                fi
            done
            read -p "Press Enter to continue..."
            ;;
        *) 
            echo -e "${RED}Invalid choice${NC}"
            ;;
    esac
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    # Setup
    check_dependencies
    mkdir -p "$(dirname "$LOG_FILE")"
    log "GitRay Development Environment Manager started"
    
    # Check for command line arguments
    case "${1:-}" in
        "start"|"dev") full_development_setup ;;
        "quick") quick_start ;;
        "build") production_build ;;
        "test") run_tests ;;
        "clean") clean_environment ;;
        "stop") stop_all_services ;;
        "status") print_header; show_system_status ;;
        *) show_main_menu ;;
    esac
}

# Execute main function
main "$@"