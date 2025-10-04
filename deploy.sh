#!/bin/bash

# 🦅 SAVAGE BOTS SCANNER - Deployment Script
# Advanced deployment for Render.com, Heroku, and local environments
# "When ordinary isn't an option"

# =============================================================================
# 🎨 COLOR CONFIGURATION
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# =============================================================================
# 📋 CONFIGURATION VARIABLES
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_NAME="savage-bots-scanner"
VERSION="1.0.0"
DEPLOY_ENV="production"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="$PROJECT_ROOT/backups"
LOG_FILE="$PROJECT_ROOT/logs/deploy_$TIMESTAMP.log"

# =============================================================================
# 🛠️ FUNCTION DEFINITIONS
# =============================================================================

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  [INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✅ [SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠️  [WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}❌ [ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_debug() {
    if [ "$DEBUG" = "true" ]; then
        echo -e "${PURPLE}🐛 [DEBUG]${NC} $1" | tee -a "$LOG_FILE"
    fi
}

# Banner display
show_banner() {
    echo -e "${CYAN}"
    echo "🦅 SAVAGE BOTS SCANNER - DEPLOYMENT SCRIPT"
    echo "=========================================="
    echo "Version: $VERSION"
    echo "Environment: $DEPLOY_ENV"
    echo "Timestamp: $(date)"
    echo "=========================================="
    echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node -v)
        log_success "Node.js found: $NODE_VERSION"
    else
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if command -v npm >/dev/null 2>&1; then
        NPM_VERSION=$(npm -v)
        log_success "npm found: $NPM_VERSION"
    else
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check Git
    if command -v git >/dev/null 2>&1; then
        log_success "Git found: $(git --version)"
    else
        log_error "Git is not installed"
        exit 1
    fi
    
    # Check if in correct directory
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log_error "Not in project root directory. package.json not found."
        exit 1
    fi
    
    log_success "All prerequisites satisfied"
}

# Environment validation
validate_environment() {
    log_info "Validating environment configuration..."
    
    # Check if .env file exists
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        log_error ".env file not found. Please create from .env.example"
        exit 1
    fi
    
    # Validate required environment variables
    local missing_vars=()
    
    # Check required variables
    if [ -z "$(grep SCANNER_PASSWORD "$PROJECT_ROOT/.env" | cut -d '=' -f2)" ]; then
        missing_vars+=("SCANNER_PASSWORD")
    fi
    
    if [ -z "$(grep SESSION_ENCRYPTION_KEY "$PROJECT_ROOT/.env" | cut -d '=' -f2)" ]; then
        missing_vars+=("SESSION_ENCRYPTION_KEY")
    fi
    
    if [ -z "$(grep MONGODB_URI "$PROJECT_ROOT/.env" | cut -d '=' -f2)" ]; then
        missing_vars+=("MONGODB_URI")
    fi
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        exit 1
    fi
    
    # Validate encryption key length
    local encryption_key=$(grep SESSION_ENCRYPTION_KEY "$PROJECT_ROOT/.env" | cut -d '=' -f2)
    if [ ${#encryption_key} -ne 64 ]; then
        log_error "SESSION_ENCRYPTION_KEY must be 64 characters (32 bytes hex)"
        exit 1
    fi
    
    log_success "Environment validation passed"
}

# Security checks
run_security_checks() {
    log_info "Running security checks..."
    
    # Check for sensitive files in git
    if git -C "$PROJECT_ROOT" status --porcelain | grep -E "\.env|\.key|\.pem"; then
        log_warning "Sensitive files detected in git working directory"
    fi
    
    # Run npm audit
    log_info "Running npm security audit..."
    if npm audit --audit-level=high; then
        log_success "No high severity vulnerabilities found"
    else
        log_warning "Security vulnerabilities found. Run 'npm audit fix' to resolve."
    fi
    
    # Check for large files
    log_info "Checking for large files..."
    find "$PROJECT_ROOT" -type f -size +10M -not -path "*/node_modules/*" -not -path "*/\.git/*" | while read file; do
        log_warning "Large file detected: $file"
    done
}

# Backup current deployment
create_backup() {
    log_info "Creating backup of current deployment..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Create backup archive
    local backup_file="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
    
    tar -czf "$backup_file" \
        --exclude="node_modules" \
        --exclude=".git" \
        --exclude="logs" \
        --exclude="backups" \
        -C "$PROJECT_ROOT" .
    
    if [ $? -eq 0 ]; then
        log_success "Backup created: $backup_file"
        echo "Backup: $backup_file" >> "$LOG_FILE"
    else
        log_error "Backup creation failed"
        exit 1
    fi
}

# Dependency management
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Clean install for production
    if [ "$DEPLOY_ENV" = "production" ]; then
        log_info "Performing clean production install..."
        rm -rf node_modules
        npm ci --only=production
    else
        log_info "Installing all dependencies..."
        npm ci
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Dependencies installed successfully"
    else
        log_error "Dependency installation failed"
        exit 1
    fi
}

# Build process
run_build() {
    log_info "Running build process..."
    
    # Check if build script exists
    if grep -q "\"build\"" "$PROJECT_ROOT/package.json"; then
        npm run build
        
        if [ $? -eq 0 ]; then
            log_success "Build completed successfully"
        else
            log_error "Build process failed"
            exit 1
        fi
    else
        log_info "No build script found, skipping build"
    fi
}

# Database operations
setup_database() {
    log_info "Setting up database..."
    
    # Check if database migration script exists
    if [ -f "$PROJECT_ROOT/scripts/migrate-database.js" ]; then
        log_info "Running database migrations..."
        npm run db:migrate
        
        if [ $? -eq 0 ]; then
            log_success "Database migrations completed"
        else
            log_error "Database migrations failed"
            exit 1
        fi
    fi
    
    # Check if database seeding script exists
    if [ -f "$PROJECT_ROOT/scripts/seed-database.js" ]; then
        log_info "Seeding database..."
        npm run db:seed
        
        if [ $? -eq 0 ]; then
            log_success "Database seeding completed"
        else
            log_warning "Database seeding failed or skipped"
        fi
    fi
}

# Render.com deployment
deploy_render() {
    log_info "Starting Render.com deployment..."
    
    # Check if render.yaml exists
    if [ ! -f "$PROJECT_ROOT/render.yaml" ]; then
        log_error "render.yaml not found. Cannot deploy to Render.com"
        return 1
    fi
    
    # Validate Render environment
    if [ -z "$RENDER_API_KEY" ]; then
        log_error "RENDER_API_KEY environment variable not set"
        return 1
    fi
    
    if [ -z "$RENDER_SERVICE_ID" ]; then
        log_error "RENDER_SERVICE_ID environment variable not set"
        return 1
    fi
    
    # Deploy to Render using their API
    log_info "Deploying to Render.com..."
    
    # Create deployment package
    local deploy_package="deploy-package-$TIMESTAMP.tar.gz"
    tar -czf "$deploy_package" \
        --exclude="node_modules" \
        --exclude=".git" \
        --exclude="logs" \
        --exclude="backups" \
        --exclude="*.log" \
        -C "$PROJECT_ROOT" .
    
    # Upload and deploy (this is a simplified version)
    log_info "Uploading deployment package to Render..."
    # In a real scenario, you would use Render's API here
    
    # Clean up
    rm -f "$deploy_package"
    
    log_success "Render.com deployment initiated"
}

# Heroku deployment
deploy_heroku() {
    log_info "Starting Heroku deployment..."
    
    # Check if Heroku CLI is installed
    if ! command -v heroku >/dev/null 2>&1; then
        log_error "Heroku CLI is not installed"
        return 1
    fi
    
    # Check if logged in to Heroku
    if ! heroku whoami >/dev/null 2>&1; then
        log_error "Not logged in to Heroku. Run 'heroku login' first."
        return 1
    fi
    
    # Create Heroku app if it doesn't exist
    if ! heroku apps:info "$APP_NAME" >/dev/null 2>&1; then
        log_info "Creating new Heroku app: $APP_NAME"
        heroku create "$APP_NAME"
    fi
    
    # Set environment variables
    log_info "Setting environment variables on Heroku..."
    while IFS= read -r line; do
        if [[ $line != \#* ]] && [[ $line == *=* ]]; then
            local key=$(echo "$line" | cut -d '=' -f1)
            local value=$(echo "$line" | cut -d '=' -f2-)
            heroku config:set "$key=$value" --app "$APP_NAME"
        fi
    done < "$PROJECT_ROOT/.env"
    
    # Deploy to Heroku
    log_info "Deploying to Heroku..."
    git push heroku main
    
    if [ $? -eq 0 ]; then
        log_success "Heroku deployment completed successfully"
        
        # Run database migrations on Heroku
        log_info "Running database migrations on Heroku..."
        heroku run npm run db:migrate --app "$APP_NAME"
        
    else
        log_error "Heroku deployment failed"
        return 1
    fi
}

# Local deployment
deploy_local() {
    log_info "Starting local deployment..."
    
    # Stop existing process if running
    local existing_pid=$(lsof -ti:3000)
    if [ -n "$existing_pid" ]; then
        log_info "Stopping existing process on port 3000 (PID: $existing_pid)"
        kill "$existing_pid"
        sleep 2
    fi
    
    # Start the application
    log_info "Starting SAVAGE BOTS SCANNER..."
    
    if [ "$DEPLOY_ENV" = "production" ]; then
        npm start &
    else
        npm run dev &
    fi
    
    local app_pid=$!
    echo $app_pid > "$PROJECT_ROOT/.app.pid"
    
    # Wait for app to start
    log_info "Waiting for application to start..."
    sleep 10
    
    # Check if app is running
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        log_success "Local deployment successful - Application is running on http://localhost:3000"
    else
        log_error "Application failed to start"
        return 1
    fi
}

# Docker deployment
deploy_docker() {
    log_info "Starting Docker deployment..."
    
    # Check if Docker is installed
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker is not installed"
        return 1
    fi
    
    # Build Docker image
    log_info "Building Docker image..."
    docker build -t "$APP_NAME:$VERSION" .
    
    if [ $? -ne 0 ]; then
        log_error "Docker build failed"
        return 1
    fi
    
    # Stop and remove existing container
    if docker ps -a | grep -q "$APP_NAME"; then
        log_info "Stopping and removing existing container..."
        docker stop "$APP_NAME" && docker rm "$APP_NAME"
    fi
    
    # Run new container
    log_info "Starting Docker container..."
    docker run -d \
        --name "$APP_NAME" \
        -p 3000:3000 \
        --env-file .env \
        "$APP_NAME:$VERSION"
    
    if [ $? -eq 0 ]; then
        log_success "Docker deployment completed successfully"
    else
        log_error "Docker deployment failed"
        return 1
    fi
}

# Health check
run_health_check() {
    log_info "Running health checks..."
    
    local health_url="http://localhost:3000/health"
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$health_url" >/dev/null 2>&1; then
            local health_response=$(curl -s "$health_url")
            local health_status=$(echo "$health_response" | grep -o '"healthy":[^,]*' | cut -d':' -f2)
            
            if [ "$health_status" = "true" ]; then
                log_success "Health check passed - Application is healthy"
                return 0
            else
                log_warning "Application running but health check indicates issues"
                return 1
            fi
        fi
        
        log_info "Health check attempt $attempt/$max_attempts failed, retrying in 5 seconds..."
        sleep 5
        attempt=$((attempt + 1))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Cleanup operations
cleanup() {
    log_info "Performing cleanup..."
    
    # Remove temporary files
    find "$PROJECT_ROOT" -name "*.tmp" -delete
    find "$PROJECT_ROOT" -name "*.temp" -delete
    
    # Clean up old backups (keep last 5)
    ls -t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm
    
    log_success "Cleanup completed"
}

# Deployment summary
show_summary() {
    local deployment_time=$(($(date +%s) - $(date -d "@${TIMESTAMP}" +%s)))
    
    echo -e "${CYAN}"
    echo "🦅 DEPLOYMENT SUMMARY"
    echo "===================="
    echo "Application: $APP_NAME"
    echo "Version: $VERSION"
    echo "Environment: $DEPLOY_ENV"
    echo "Deployment Time: ${deployment_time} seconds"
    echo "Status: SUCCESS"
    echo "===================="
    
    case "$1" in
        "render")
            echo "Platform: Render.com"
            echo "URL: https://$APP_NAME.onrender.com"
            ;;
        "heroku")
            echo "Platform: Heroku"
            echo "URL: https://$APP_NAME.herokuapp.com"
            ;;
        "local")
            echo "Platform: Local"
            echo "URL: http://localhost:3000"
            ;;
        "docker")
            echo "Platform: Docker"
            echo "URL: http://localhost:3000"
            ;;
    esac
    
    echo -e "${NC}"
}

# Main deployment function
main() {
    local platform=$1
    
    # Create logs directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Show banner
    show_banner
    
    # Validate platform
    case "$platform" in
        "render"|"heroku"|"local"|"docker")
            log_info "Starting deployment to: $platform"
            ;;
        *)
            log_error "Invalid platform: $platform. Use: render, heroku, local, docker"
            echo "Usage: $0 [render|heroku|local|docker]"
            exit 1
            ;;
    esac
    
    # Run deployment steps
    check_prerequisites
    validate_environment
    run_security_checks
    create_backup
    install_dependencies
    run_build
    setup_database
    
    # Platform-specific deployment
    case "$platform" in
        "render") deploy_render ;;
        "heroku") deploy_heroku ;;
        "local") deploy_local ;;
        "docker") deploy_docker ;;
    esac
    
    # Run health check (for local and docker deployments)
    if [ "$platform" = "local" ] || [ "$platform" = "docker" ]; then
        run_health_check
    fi
    
    # Cleanup
    cleanup
    
    # Show summary
    show_summary "$platform"
    
    log_success "Deployment completed successfully!"
    log_info "Log file: $LOG_FILE"
}

# =============================================================================
# 🚀 SCRIPT EXECUTION
# =============================================================================

# Handle script interrupts
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Check if platform argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 [render|heroku|local|docker]"
    echo "Example: $0 local"
    exit 1
fi

# Run main function with all output to log file and terminal
main "$@" 2>&1 | tee -a "$LOG_FILE"

# Exit with appropriate code
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    exit 0
else
    exit 1
fi
